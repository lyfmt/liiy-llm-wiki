import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createKnowledgeInsertPipelineState,
  type KnowledgeInsertPipelineState,
  type KnowledgeInsertStageName
} from '../../domain/knowledge-insert-pipeline.js';
import {
  createKnowledgeInsertGraphWriteFromConnectedKnowledge,
  type KnowledgeInsertGraphWrite
} from '../../domain/knowledge-insert-graph-write.js';
import { getSharedGraphDatabasePool, resolveGraphDatabaseUrl, type GraphDatabaseClient } from '../../storage/graph-database.js';
import { loadProjectEnv } from '../../storage/project-env-store.js';
import {
  saveKnowledgeInsertGraphWrite,
  KnowledgeInsertGraphWriteConflictError,
  type KnowledgeInsertSemanticMergeCandidate
} from '../../storage/save-knowledge-insert-graph-write.js';
import { loadSourceManifest } from '../../storage/source-manifest-store.js';

import { runPipelineJsonStage } from './pipeline-agent-stage.js';
import { readKnowledgeInsertPipelineArtifact, writeKnowledgeInsertPipelineArtifact } from './pipeline-artifacts.js';
import {
  parsePartExtractionArtifact,
  parsePartitionPlanArtifact,
  parseTopicPlanArtifact,
  type ConnectedKnowledgeArtifact,
  type PartExtractionConcept,
  type PartExtractionEntity,
  type PartExtractionEvidenceAnchor,
  type PartExtractionArtifact,
  type PartitionPlanArtifact,
  type TopicPlanArtifact,
  type TopicPlanTopic
} from './pipeline-schema.js';

const DEFAULT_PARTITION_CHUNK_MAX_CHARS = 40_000;
const DEFAULT_PART_EXTRACTION_CONCURRENCY = 1;

export type PipelineStageGenerator = (prompt: string) => Promise<string>;

export interface RunKnowledgeInsertPipelineInput {
  runId: string;
  sourceId: string;
  stageGenerators: Partial<Record<'topics.planned' | 'parts.planned' | 'parts.extracted', PipelineStageGenerator>>;
  graphClient?: GraphDatabaseClient;
  stopAfter?: KnowledgeInsertStageName;
  partitionChunkMaxChars?: number;
  maxPartExtractionConcurrency?: number;
}

export interface RunKnowledgeInsertPipelineResult {
  state: KnowledgeInsertPipelineState;
  artifacts: Record<string, string>;
  graphWrite?: KnowledgeInsertGraphWrite;
}

interface MaterializedPart {
  partId: string;
  title: string;
  sourceId: string;
  text: string;
  startLine: number;
  endLine: number;
  topicIds: string[];
}

interface SourceResource {
  schemaVersion: 'knowledge-insert.source-resource.v3';
  sourceId: string;
  title: string;
  rawPath: string;
  canonicalMarkdown: string;
  lineIndex: SourceLine[];
}

interface SourceLine {
  line: number;
  text: string;
}

interface SourceChunkResource extends SourceResource {
  chunkId: string;
  startLine: number;
  endLine: number;
}

export async function runKnowledgeInsertPipeline(
  root: string,
  input: RunKnowledgeInsertPipelineInput
): Promise<RunKnowledgeInsertPipelineResult> {
  const artifacts: Record<string, string> = {};
  let state = createState(input, 'source.uploaded', 'running', artifacts);
  await persistState(root, input.runId, state);

  const manifest = await loadSourceManifest(root, input.sourceId);
  const markdown = await readFile(path.join(root, manifest.path), 'utf8');
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  const sourceResource: SourceResource = {
    schemaVersion: 'knowledge-insert.source-resource.v3',
    sourceId: input.sourceId,
    title: manifest.title,
    rawPath: manifest.path,
    canonicalMarkdown: markdown,
    lineIndex: lines.map((text, index) => ({ line: index + 1, text }))
  };
  artifacts.sourceResource = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, 'source-resource.json', sourceResource)).projectPath;
  state = await advance(root, input, 'source.prepared', 'running', artifacts);
  if (input.stopAfter === 'source.prepared') return { state, artifacts };

  const topicPlan = await runAdaptiveTopicPlanStage(input, sourceResource);
  artifacts.topicPlan = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, 'topic-plan.json', topicPlan)).projectPath;
  state = await advance(root, input, 'topics.planned', 'running', artifacts);
  if (input.stopAfter === 'topics.planned') return { state, artifacts };

  const sourceChunks = createSourceChunks(sourceResource, input.partitionChunkMaxChars ?? DEFAULT_PARTITION_CHUNK_MAX_CHARS);
  artifacts.partitionChunks = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, 'partition-chunks.json', {
    schemaVersion: 'knowledge-insert.partition-chunks.v3',
    sourceId: input.sourceId,
    chunks: sourceChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      charCount: chunk.canonicalMarkdown.length
    }))
  })).projectPath;

  const localPartitionPlans: PartitionPlanArtifact[] = [];
  for (const sourceChunk of sourceChunks) {
    const localPartitionPlan = await runPartitionPlanStage(input, sourceChunk, topicPlan);
    normalizePartitionPlanTopicIds(localPartitionPlan, topicPlan);
    validatePartitionPlan(localPartitionPlan, lines.length, new Set(topicPlan.topics.map((topic) => topic.topicId)));
    validatePartitionPlanWithinChunk(localPartitionPlan, sourceChunk);
    localPartitionPlans.push(localPartitionPlan);
    artifacts[`partitionPlan:${sourceChunk.chunkId}`] = (await writeKnowledgeInsertPipelineArtifact(
      root,
      input.runId,
      `partition-plans/${sourceChunk.chunkId}.json`,
      localPartitionPlan
    )).projectPath;
  }

  const partitionPlan = mergePartitionPlans(input.sourceId, localPartitionPlans);
  normalizePartitionPlanTopicIds(partitionPlan, topicPlan);
  validatePartitionPlan(partitionPlan, lines.length, new Set(topicPlan.topics.map((topic) => topic.topicId)));
  artifacts.partitionPlan = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, 'partition-plan.json', partitionPlan)).projectPath;
  state = await advance(root, input, 'parts.planned', 'running', artifacts);
  if (input.stopAfter === 'parts.planned') return { state, artifacts };

  const parts = materializeParts(partitionPlan, lines, input.sourceId);
  artifacts.parts = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, 'parts.json', { schemaVersion: 'knowledge-insert.parts.v3', sourceId: input.sourceId, parts })).projectPath;
  state = await advance(root, input, 'parts.materialized', 'running', artifacts);
  if (input.stopAfter === 'parts.materialized') return { state, artifacts };

  const extractions = await extractPartsWithProgress(root, input, parts, artifacts);
  state = await advance(root, input, 'parts.extracted', 'running', artifacts, [], {
    total: parts.length,
    completed: parts.length,
    running: [],
    pending: 0
  });
  if (input.stopAfter === 'parts.extracted') return { state, artifacts };

  const connectedKnowledge = connectKnowledge(input.sourceId, topicPlan, extractions);
  artifacts.connectedKnowledge = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, 'connected-knowledge.json', connectedKnowledge)).projectPath;
  state = await advance(root, input, 'knowledge.connected', 'running', artifacts);
  if (input.stopAfter === 'knowledge.connected') return { state, artifacts };

  const graphWrite = createKnowledgeInsertGraphWriteFromConnectedKnowledge(connectedKnowledge);
  artifacts.graphWrite = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, 'graph-write.json', graphWrite)).projectPath;
  state = await advance(root, input, 'graph.prepared', 'running', artifacts);
  if (input.stopAfter === 'graph.prepared') return { state, artifacts, graphWrite };

  try {
    const semanticMergeReviewQueue: KnowledgeInsertSemanticMergeCandidate[] = [];
    await saveKnowledgeInsertGraphWrite(input.graphClient ?? await resolveGraphClient(root), graphWrite, undefined, {
      semanticMergeQueue: {
        enqueue: (candidate) => {
          semanticMergeReviewQueue.push(candidate);
        }
      }
    });
    if (semanticMergeReviewQueue.length > 0) {
      artifacts.semanticMergeReviewQueue = (await writeKnowledgeInsertPipelineArtifact(
        root,
        input.runId,
        'semantic-merge-review-queue.json',
        {
          schemaVersion: 'knowledge-insert.semantic-merge-review-queue.v3',
          sourceId: input.sourceId,
          candidates: semanticMergeReviewQueue
        }
      )).projectPath;
    }
  } catch (error) {
    if (error instanceof KnowledgeInsertGraphWriteConflictError) {
      state = await advance(root, input, 'graph.prepared', 'needs_review', artifacts, [error.message]);
      return { state, artifacts, graphWrite };
    }
    throw error;
  }

  state = await advance(root, input, 'graph.written', 'running', artifacts);
  if (input.stopAfter === 'graph.written') return { state, artifacts, graphWrite };

  state = await advance(root, input, 'wiki.projected', 'running', artifacts);
  if (input.stopAfter === 'wiki.projected') return { state, artifacts, graphWrite };

  state = await advance(root, input, 'lint.completed', 'done', artifacts);
  return { state, artifacts, graphWrite };
}

async function extractPartsWithProgress(
  root: string,
  input: RunKnowledgeInsertPipelineInput,
  parts: MaterializedPart[],
  artifacts: Record<string, string>
): Promise<PartExtractionArtifact[]> {
  const extractions = new Array<PartExtractionArtifact>(parts.length);
  const completedPartIds = new Set<string>();
  const runningPartIds = new Set<string>();
  let nextIndex = 0;
  const workerCount = Math.min(parts.length, normalizeConcurrency(input.maxPartExtractionConcurrency));

  const persistProgress = async () => {
    await persistState(root, input.runId, createState(input, 'parts.materialized', 'running', artifacts, [], {
      total: parts.length,
      completed: completedPartIds.size,
      running: [...runningPartIds].sort(),
      pending: parts.length - completedPartIds.size - runningPartIds.size
    }));
  };

  await persistProgress();

  const worker = async () => {
    while (nextIndex < parts.length) {
      const index = nextIndex;
      nextIndex += 1;
      const part = parts[index]!;
      const artifactPath = `part-extractions/${part.partId}.json`;
      const existing = await loadPartExtractionIfExists(root, input.runId, artifactPath);

      if (existing) {
        if (existing.partId !== part.partId) {
          throw new Error(`Part extraction returned mismatched partId: ${existing.partId}`);
        }
        extractions[index] = existing;
        artifacts[`partExtraction:${part.partId}`] = `state/artifacts/knowledge-insert-pipeline/${input.runId}/${artifactPath}`;
        completedPartIds.add(part.partId);
        await persistProgress();
        continue;
      }

      runningPartIds.add(part.partId);
      await persistProgress();
      try {
        const extraction = await runPartExtractionStage(input, part);
        if (extraction.partId !== part.partId) {
          throw new Error(`Part extraction returned mismatched partId: ${extraction.partId}`);
        }
        extractions[index] = extraction;
        artifacts[`partExtraction:${part.partId}`] = (await writeKnowledgeInsertPipelineArtifact(root, input.runId, artifactPath, extraction)).projectPath;
        completedPartIds.add(part.partId);
      } finally {
        runningPartIds.delete(part.partId);
        await persistProgress();
      }
    }
  };

  const workerResults = await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
  const failedWorker = workerResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failedWorker) {
    throw failedWorker.reason;
  }

  return extractions;
}

async function loadPartExtractionIfExists(root: string, runId: string, artifactPath: string): Promise<PartExtractionArtifact | null> {
  try {
    return parsePartExtractionArtifact(await readKnowledgeInsertPipelineArtifact(root, runId, artifactPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PART_EXTRACTION_CONCURRENCY;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('maxPartExtractionConcurrency must be a positive integer');
  }
  return value;
}

async function runAdaptiveTopicPlanStage(
  input: RunKnowledgeInsertPipelineInput,
  sourceResource: SourceResource
): Promise<TopicPlanArtifact> {
  try {
    return await runTopicPlanStage(input, sourceResource);
  } catch (error) {
    if (sourceResource.lineIndex.length <= 1) {
      throw error;
    }

    const [left, right] = splitSourceResource(sourceResource);
    const leftPlan = await runAdaptiveTopicPlanStage(input, left);
    const rightPlan = await runAdaptiveTopicPlanStage(input, right);
    return mergeTopicPlans(input.sourceId, [leftPlan, rightPlan]);
  }
}

async function runTopicPlanStage(input: RunKnowledgeInsertPipelineInput, sourceResource: SourceResource): Promise<TopicPlanArtifact> {
  const generated = await runPipelineJsonStage({
    stage: 'topics.planned',
    schemaVersion: 'knowledge-insert.topic-plan.v3',
    inputJson: sourceResource,
    exampleJson: {
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      sourceId: input.sourceId,
      topics: [{ topicId: 'topic-a', slug: 'topic-a', title: 'Topic A', scope: 'Scope', rationale: 'Because' }]
    },
    generate: requireGenerator(input, 'topics.planned'),
    validate: parseTopicPlanArtifact
  });
  return parseTopicPlanArtifact(generated);
}

async function runPartitionPlanStage(
  input: RunKnowledgeInsertPipelineInput,
  sourceResource: unknown,
  topicPlan: TopicPlanArtifact
): Promise<PartitionPlanArtifact> {
  const generated = await runPipelineJsonStage({
    stage: 'parts.planned',
    schemaVersion: 'knowledge-insert.partition-plan.v3',
    inputJson: { sourceResource, topicPlan },
    exampleJson: {
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: input.sourceId,
      parts: [{ partId: 'part-001', title: 'Intro', startLine: 1, endLine: 20, topicIds: ['topic-a'], rationale: 'Opening section' }]
    },
    generate: requireGenerator(input, 'parts.planned'),
    validate: parsePartitionPlanArtifact
  });
  return parsePartitionPlanArtifact(generated);
}

async function runPartExtractionStage(input: RunKnowledgeInsertPipelineInput, part: MaterializedPart): Promise<PartExtractionArtifact> {
  const generated = await runPipelineJsonStage({
    stage: 'parts.extracted',
    schemaVersion: 'knowledge-insert.part-extraction.v3',
    inputJson: part,
    exampleJson: {
      schemaVersion: 'knowledge-insert.part-extraction.v3',
      sourceId: input.sourceId,
      partId: part.partId,
      sections: [{
        sectionId: 'section-part-001-001',
        title: 'A concise knowledge section',
        body: 'A synthesized section grounded in the source part.',
        topicIds: ['topic-a'],
        entityIds: ['entity-example'],
        conceptIds: ['concept-example'],
        evidenceAnchorIds: ['evidence-part-001-001']
      }],
      entities: [{ entityId: 'entity-example', name: 'Example Entity', summary: 'A named object from the source.', aliases: [] }],
      concepts: [{ conceptId: 'concept-example', name: 'Example Concept', summary: 'An abstract concept from the source.', aliases: [] }],
      evidenceAnchors: [{ anchorId: 'evidence-part-001-001', locator: 'raw/accepted/source.md#L1-L20', quote: 'short quote', startLine: 1, endLine: 20 }]
    },
    generate: requireGenerator(input, 'parts.extracted'),
    validate: parsePartExtractionArtifact
  });
  return parsePartExtractionArtifact(generated);
}

function materializeParts(partitionPlan: PartitionPlanArtifact, lines: string[], sourceId: string): MaterializedPart[] {
  return partitionPlan.parts.map((part) => ({
    partId: part.partId,
    title: part.title,
    sourceId,
    text: lines.slice(part.startLine - 1, part.endLine).join('\n'),
    startLine: part.startLine,
    endLine: part.endLine,
    topicIds: [...part.topicIds]
  }));
}

function createSourceChunks(sourceResource: SourceResource, maxChars: number): SourceChunkResource[] {
  if (!Number.isFinite(maxChars) || maxChars < 1) {
    throw new Error('partitionChunkMaxChars must be a positive number');
  }

  const chunks: SourceChunkResource[] = [];
  let currentLines: SourceLine[] = [];
  let currentChars = 0;

  const flush = () => {
    if (currentLines.length === 0) {
      return;
    }

    const chunkId = `chunk-${String(chunks.length + 1).padStart(3, '0')}`;
    chunks.push(createSourceChunkResource(sourceResource, chunkId, currentLines));
    currentLines = [];
    currentChars = 0;
  };

  for (const line of sourceResource.lineIndex) {
    const lineChars = line.text.length + 1;
    if (currentLines.length > 0 && currentChars + lineChars > maxChars) {
      flush();
    }
    currentLines.push(line);
    currentChars += lineChars;
  }

  flush();
  return chunks;
}

function createSourceChunkResource(
  sourceResource: SourceResource,
  chunkId: string,
  lineIndex: SourceLine[]
): SourceChunkResource {
  const firstLine = lineIndex[0]!;
  const lastLine = lineIndex.at(-1)!;
  return {
    ...sourceResource,
    chunkId,
    startLine: firstLine.line,
    endLine: lastLine.line,
    canonicalMarkdown: lineIndex.map((line) => line.text).join('\n'),
    lineIndex: lineIndex.map((line) => ({ ...line }))
  };
}

function splitSourceResource(sourceResource: SourceResource): [SourceResource, SourceResource] {
  const middle = Math.ceil(sourceResource.lineIndex.length / 2);
  const leftLines = sourceResource.lineIndex.slice(0, middle);
  const rightLines = sourceResource.lineIndex.slice(middle);

  return [
    createSourceResourceFromLines(sourceResource, leftLines),
    createSourceResourceFromLines(sourceResource, rightLines)
  ];
}

function createSourceResourceFromLines(sourceResource: SourceResource, lineIndex: SourceLine[]): SourceResource {
  return {
    ...sourceResource,
    canonicalMarkdown: lineIndex.map((line) => line.text).join('\n'),
    lineIndex: lineIndex.map((line) => ({ ...line }))
  };
}

function mergeTopicPlans(sourceId: string, topicPlans: TopicPlanArtifact[]): TopicPlanArtifact {
  const topicsById = new Map<string, TopicPlanTopic>();
  for (const topic of topicPlans.flatMap((plan) => plan.topics)) {
    const existing = topicsById.get(topic.topicId);
    if (!existing) {
      topicsById.set(topic.topicId, topic);
      continue;
    }

    topicsById.set(topic.topicId, {
      ...existing,
      scope: preferLongerText(existing.scope, topic.scope),
      rationale: preferLongerText(existing.rationale, topic.rationale)
    });
  }

  return {
    schemaVersion: 'knowledge-insert.topic-plan.v3',
    sourceId,
    topics: [...topicsById.values()]
  };
}

function mergePartitionPlans(sourceId: string, localPartitionPlans: PartitionPlanArtifact[]): PartitionPlanArtifact {
  const parts = localPartitionPlans
    .flatMap((plan) => plan.parts)
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine)
    .map((part, index) => ({
      ...part,
      partId: `part-${String(index + 1).padStart(3, '0')}`
    }));

  return {
    schemaVersion: 'knowledge-insert.partition-plan.v3',
    sourceId,
    parts
  };
}

function connectKnowledge(
  sourceId: string,
  topicPlan: TopicPlanArtifact,
  extractions: PartExtractionArtifact[]
): ConnectedKnowledgeArtifact {
  const entities = mergeNamedKnowledgeById(extractions.flatMap((extraction) => extraction.entities), (entity) => entity.entityId);
  const concepts = mergeNamedKnowledgeById(extractions.flatMap((extraction) => extraction.concepts), (concept) => concept.conceptId);
  const evidenceAnchors = mergeEvidenceAnchorsById(extractions.flatMap((extraction) => extraction.evidenceAnchors));
  const sections = extractions.flatMap((extraction) => extraction.sections);
  const topicIds = new Set(topicPlan.topics.map((topic) => topic.topicId));
  const entityIds = new Set(entities.map((entity) => entity.entityId));
  const conceptIds = new Set(concepts.map((concept) => concept.conceptId));
  const evidenceIds = new Set(evidenceAnchors.map((anchor) => anchor.anchorId));

  for (const section of sections) {
    section.topicIds = normalizeTopicIds(section.topicIds, topicPlan);
    if (section.topicIds.length === 0) {
      throw new Error(`Section must have at least one topic: ${section.sectionId}`);
    }
    if (section.evidenceAnchorIds.length === 0) {
      throw new Error(`Section must have at least one evidence anchor: ${section.sectionId}`);
    }
    assertAllExist(section.topicIds, topicIds, `Missing topic for section ${section.sectionId}`);
    assertAllExist(section.entityIds, entityIds, `Missing entity for section ${section.sectionId}`);
    assertAllExist(section.conceptIds, conceptIds, `Missing concept for section ${section.sectionId}`);
    assertAllExist(section.evidenceAnchorIds, evidenceIds, `Missing evidence for section ${section.sectionId}`);
  }

  return {
    schemaVersion: 'knowledge-insert.connected-knowledge.v3',
    sourceId,
    topics: topicPlan.topics,
    sections,
    entities,
    concepts,
    evidenceAnchors
  };
}

function normalizePartitionPlanTopicIds(partitionPlan: PartitionPlanArtifact, topicPlan: TopicPlanArtifact): void {
  for (const part of partitionPlan.parts) {
    part.topicIds = normalizeTopicIds(part.topicIds, topicPlan);
  }
}

function normalizeTopicIds(values: string[], topicPlan: TopicPlanArtifact): string[] {
  const topicIds = new Set(topicPlan.topics.map((topic) => topic.topicId));
  const topicBySlug = new Map(topicPlan.topics.map((topic) => [topic.slug, topic.topicId]));
  const fallbackTopicId = topicPlan.topics[0]?.topicId;
  const normalized = values.flatMap((value) => {
    if (topicIds.has(value)) {
      return [value];
    }

    const withoutPrefix = value.replace(/^topic[-:]/u, '');
    const slugMatch = topicBySlug.get(value) ?? topicBySlug.get(withoutPrefix);
    if (slugMatch) {
      return [slugMatch];
    }

    return fallbackTopicId ? [fallbackTopicId] : [];
  });

  return [...new Set(normalized)];
}

function mergeNamedKnowledgeById<T extends PartExtractionEntity | PartExtractionConcept>(
  values: T[],
  keyOf: (value: T) => string
): T[] {
  const map = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...value,
        aliases: uniqueStrings(value.aliases)
      });
      continue;
    }

    const aliases = uniqueStrings([
      ...existing.aliases,
      ...value.aliases,
      ...(existing.name === value.name ? [] : [value.name])
    ]);
    map.set(key, {
      ...existing,
      summary: preferLongerText(existing.summary, value.summary),
      aliases
    });
  }
  return [...map.values()];
}

function mergeEvidenceAnchorsById(values: PartExtractionEvidenceAnchor[]): PartExtractionEvidenceAnchor[] {
  const map = new Map<string, PartExtractionEvidenceAnchor>();
  for (const value of values) {
    const existing = map.get(value.anchorId);
    if (!existing) {
      map.set(value.anchorId, value);
      continue;
    }

    map.set(value.anchorId, {
      ...existing,
      quote: preferLongerText(existing.quote, value.quote),
      startLine: Math.min(existing.startLine, value.startLine),
      endLine: Math.max(existing.endLine, value.endLine)
    });
  }
  return [...map.values()];
}

function preferLongerText(left: string, right: string): string {
  return right.length > left.length ? right : left;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ''))];
}

function validatePartitionPlan(partitionPlan: PartitionPlanArtifact, lineCount: number, topicIds: Set<string>): void {
  for (const part of partitionPlan.parts) {
    if (part.startLine < 1 || part.startLine > part.endLine) {
      throw new Error(`Invalid partition part range: ${part.partId}`);
    }
    if (part.endLine > lineCount) {
      throw new Error(`Invalid partition part range: ${part.partId}`);
    }
    assertAllExist(part.topicIds, topicIds, `Missing topic for part ${part.partId}`);
  }
}

function validatePartitionPlanWithinChunk(partitionPlan: PartitionPlanArtifact, sourceChunk: SourceChunkResource): void {
  for (const part of partitionPlan.parts) {
    if (part.startLine < sourceChunk.startLine || part.endLine > sourceChunk.endLine) {
      throw new Error(`Partition part is outside source chunk ${sourceChunk.chunkId}: ${part.partId}`);
    }
  }
}

function assertAllExist(values: string[], available: Set<string>, message: string): void {
  for (const value of values) {
    if (!available.has(value)) {
      throw new Error(`${message}: ${value}`);
    }
  }
}

function requireGenerator(
  input: RunKnowledgeInsertPipelineInput,
  stage: 'topics.planned' | 'parts.planned' | 'parts.extracted'
): PipelineStageGenerator {
  const generator = input.stageGenerators[stage];
  if (!generator) {
    throw new Error(`Missing pipeline stage generator: ${stage}`);
  }
  return generator;
}

async function resolveGraphClient(root: string): Promise<GraphDatabaseClient> {
  const projectEnv = await loadProjectEnv(root);
  return getSharedGraphDatabasePool(resolveGraphDatabaseUrl(projectEnv.contents));
}

async function advance(
  root: string,
  input: RunKnowledgeInsertPipelineInput,
  stage: KnowledgeInsertStageName,
  status: KnowledgeInsertPipelineState['status'],
  artifacts: Record<string, string>,
  errors: string[] = [],
  partProgress?: KnowledgeInsertPipelineState['partProgress']
): Promise<KnowledgeInsertPipelineState> {
  const state = createState(input, stage, status, artifacts, errors, partProgress);
  await persistState(root, input.runId, state);
  return state;
}

function createState(
  input: RunKnowledgeInsertPipelineInput,
  currentStage: KnowledgeInsertStageName,
  status: KnowledgeInsertPipelineState['status'],
  artifacts: Record<string, string>,
  errors: string[] = [],
  partProgress?: KnowledgeInsertPipelineState['partProgress']
): KnowledgeInsertPipelineState {
  return createKnowledgeInsertPipelineState({
    runId: input.runId,
    sourceId: input.sourceId,
    storageMode: 'pg-primary',
    currentStage,
    status,
    artifacts,
    errors,
    ...(partProgress ? { partProgress } : {})
  });
}

async function persistState(root: string, runId: string, state: KnowledgeInsertPipelineState): Promise<void> {
  await writeKnowledgeInsertPipelineArtifact(root, runId, 'pipeline-state.json', state);
}
