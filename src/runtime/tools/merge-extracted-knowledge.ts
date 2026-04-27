import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  inputArtifacts: Type.Array(Type.String({ description: 'Extractor batch artifacts to merge.' })),
  outputArtifact: Type.String({ description: 'Artifact path for the merged extraction JSON.' })
});

export type MergeExtractedKnowledgeParameters = Static<typeof parameters>;

export interface KnowledgeEntityCandidate {
  entityId: string;
  name: string;
  [key: string]: unknown;
}

export interface KnowledgeAssertionCandidate {
  assertionId: string;
  text: string;
  sectionCandidateId?: string;
  [key: string]: unknown;
}

export interface KnowledgeRelationCandidate {
  relationId: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  [key: string]: unknown;
}

export interface KnowledgeEvidenceAnchor {
  anchorId: string;
  blockId: string;
  quote: string;
  [key: string]: unknown;
}

export interface KnowledgeSectionCandidate {
  sectionCandidateId: string;
  title: string;
  summary: string;
  [key: string]: unknown;
}

export interface KnowledgeTopicHint {
  topicSlug: string;
  confidence?: string;
  [key: string]: unknown;
}

export interface MergedExtractedKnowledgeArtifact {
  inputArtifacts: string[];
  entities: KnowledgeEntityCandidate[];
  assertions: KnowledgeAssertionCandidate[];
  relations: KnowledgeRelationCandidate[];
  evidenceAnchors: KnowledgeEvidenceAnchor[];
  sectionCandidates: KnowledgeSectionCandidate[];
  topicHints: KnowledgeTopicHint[];
}

export function createMergeExtractedKnowledgeTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'merge_extracted_knowledge',
    label: 'Merge Extracted Knowledge',
    description:
      'Merge multiple extractor batch artifacts into a deduplicated set of entities, assertions, relations, evidence anchors, section candidates, and topic hints.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedInputs = params.inputArtifacts.map((artifactPath) =>
        resolveStateArtifactPath(runtimeContext.root, artifactPath)
      );
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const batches = await Promise.all(
        resolvedInputs.map(async (resolved) => parseExtractionBatch(await readFile(resolved.absolutePath, 'utf8')))
      );
      const merged: MergedExtractedKnowledgeArtifact = {
        inputArtifacts: resolvedInputs.map((resolved) => resolved.projectPath),
        entities: dedupeCandidates(batches.flatMap((batch) => batch.entities), 'entityId'),
        assertions: dedupeCandidates(batches.flatMap((batch) => batch.assertions), 'assertionId'),
        relations: dedupeCandidates(batches.flatMap((batch) => batch.relations), 'relationId'),
        evidenceAnchors: dedupeCandidates(batches.flatMap((batch) => batch.evidenceAnchors), 'anchorId'),
        sectionCandidates: mergeSectionCandidates(batches.flatMap((batch) => batch.sectionCandidates)),
        topicHints: mergeTopicHints(batches.flatMap((batch) => batch.topicHints))
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'merge_extracted_knowledge',
        summary: `merged ${resolvedInputs.length} extraction batches`,
        evidence: resolvedInputs.map((resolved) => resolved.absolutePath),
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          entityCount: merged.entities.length,
          assertionCount: merged.assertions.length,
          relationCount: merged.relations.length,
          evidenceAnchorCount: merged.evidenceAnchors.length,
          sectionCandidateCount: merged.sectionCandidates.length,
          topicHintCount: merged.topicHints.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Merged extraction batches: ${resolvedInputs.length}`,
          `Entities: ${merged.entities.length}`,
          `Assertions: ${merged.assertions.length}`,
          `Relations: ${merged.relations.length}`,
          `Evidence anchors: ${merged.evidenceAnchors.length}`,
          `Section candidates: ${merged.sectionCandidates.length}`,
          `Topic hints: ${merged.topicHints.length}`,
          `Artifact: ${resolvedOutput.projectPath}`
        ].join('\n')
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}

function parseExtractionBatch(content: string): MergedExtractedKnowledgeArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value)) {
    throw new Error('Invalid extracted knowledge batch artifact');
  }

  return {
    inputArtifacts: [],
    entities: asNormalizedArray(value.entities, normalizeKnowledgeEntityCandidate),
    assertions: asNormalizedArray(value.assertions, normalizeKnowledgeAssertionCandidate),
    relations: asNormalizedArray(value.relations, normalizeKnowledgeRelationCandidate),
    evidenceAnchors: asNormalizedArray(value.evidenceAnchors, normalizeKnowledgeEvidenceAnchor),
    sectionCandidates: asNormalizedArray(value.sectionCandidates, normalizeKnowledgeSectionCandidate),
    topicHints: asNormalizedArray(value.topicHints, normalizeKnowledgeTopicHint)
  };
}

function dedupeCandidates<T extends Record<string, unknown>>(items: T[], idField: string): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of items) {
    const key = typeof item[idField] === 'string' ? String(item[idField]) : JSON.stringify(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function mergeSectionCandidates(sectionCandidates: KnowledgeSectionCandidate[]): KnowledgeSectionCandidate[] {
  const merged = new Map<string, KnowledgeSectionCandidate>();

  for (const candidate of sectionCandidates) {
    const existing = merged.get(candidate.sectionCandidateId);

    if (!existing) {
      merged.set(candidate.sectionCandidateId, candidate);
      continue;
    }

    merged.set(candidate.sectionCandidateId, mergeRecord(existing, candidate) as KnowledgeSectionCandidate);
  }

  return [...merged.values()];
}

function mergeTopicHints(topicHints: KnowledgeTopicHint[]): KnowledgeTopicHint[] {
  const merged = new Map<string, KnowledgeTopicHint>();

  for (const hint of topicHints) {
    const key = hint.topicSlug;
    const existing = merged.get(key);

    if (!existing || getConfidenceRank(hint.confidence) > getConfidenceRank(existing.confidence)) {
      merged.set(key, hint);
    }
  }

  return [...merged.values()];
}

function mergeRecord(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...left };

  for (const [key, rightValue] of Object.entries(right)) {
    const leftValue = merged[key];

    if (leftValue === undefined) {
      merged[key] = cloneValue(rightValue);
      continue;
    }

    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      merged[key] = mergeArrayValues(leftValue, rightValue);
      continue;
    }

    if (isPlainRecord(leftValue) && isPlainRecord(rightValue)) {
      merged[key] = mergeRecord(leftValue, rightValue);
      continue;
    }

    if (typeof leftValue === 'string' && leftValue.trim().length === 0 && typeof rightValue === 'string') {
      merged[key] = rightValue;
    }
  }

  return merged;
}

function mergeArrayValues(left: unknown[], right: unknown[]): unknown[] {
  const merged: unknown[] = [];
  const seen = new Set<string>();

  for (const value of [...left, ...right]) {
    const key = createMergeKey(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(cloneValue(value));
  }

  return merged;
}

function createMergeKey(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (isPlainRecord(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  return value;
}

function getConfidenceRank(confidence: unknown): number {
  if (confidence === 'high') {
    return 3;
  }

  if (confidence === 'medium') {
    return 2;
  }

  if (confidence === 'low') {
    return 1;
  }

  return 0;
}

function asNormalizedArray<T>(value: unknown, normalize: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => normalize(entry)).filter((entry): entry is T => entry !== null);
}

function normalizeKnowledgeEntityCandidate(value: unknown): KnowledgeEntityCandidate | null {
  if (!isRecord(value)) {
    return null;
  }

  const entityId = readStringField(value, 'entityId') ?? readStringField(value, 'id');
  const name = readStringField(value, 'name');

  if (!entityId || !name) {
    return null;
  }

  return {
    ...value,
    entityId,
    name
  };
}

function normalizeKnowledgeAssertionCandidate(value: unknown): KnowledgeAssertionCandidate | null {
  if (!isRecord(value)) {
    return null;
  }

  const assertionId = readStringField(value, 'assertionId') ?? readStringField(value, 'id');
  const text =
    readStringField(value, 'text') ??
    readStringField(value, 'statement') ??
    buildAssertionText(value);

  if (!assertionId || !text) {
    return null;
  }

  const sectionCandidateId = readStringField(value, 'sectionCandidateId');

  return {
    ...value,
    assertionId,
    text,
    ...(sectionCandidateId ? { sectionCandidateId } : {})
  };
}

function normalizeKnowledgeRelationCandidate(value: unknown): KnowledgeRelationCandidate | null {
  if (!isRecord(value)) {
    return null;
  }

  const relationId = readStringField(value, 'relationId') ?? readStringField(value, 'id');
  const fromEntityId = readStringField(value, 'fromEntityId');
  const toEntityId = readStringField(value, 'toEntityId');
  const relationType = readStringField(value, 'relationType');

  if (!relationId || !fromEntityId || !toEntityId || !relationType) {
    return null;
  }

  return {
    ...value,
    relationId,
    fromEntityId,
    toEntityId,
    relationType
  };
}

function normalizeKnowledgeEvidenceAnchor(value: unknown): KnowledgeEvidenceAnchor | null {
  if (!isRecord(value)) {
    return null;
  }

  const anchorId = readStringField(value, 'anchorId') ?? readStringField(value, 'id');
  const blockId = readStringField(value, 'blockId');
  const quote = readStringField(value, 'quote') ?? readStringField(value, 'locator') ?? blockId;

  if (!anchorId || !blockId || !quote) {
    return null;
  }

  return {
    ...value,
    anchorId,
    blockId,
    quote
  };
}

function normalizeKnowledgeSectionCandidate(value: unknown): KnowledgeSectionCandidate | null {
  if (!isRecord(value)) {
    return null;
  }

  const sectionCandidateId =
    readStringField(value, 'sectionCandidateId') ??
    readStringField(value, 'sectionId') ??
    readStringField(value, 'id');
  const title = readStringField(value, 'title');

  if (!sectionCandidateId || !title) {
    return null;
  }

  const summary =
    readStringField(value, 'summary') ??
    readStringField(value, 'category') ??
    title;

  return {
    ...value,
    sectionCandidateId,
    title,
    summary,
    evidenceAnchorIds: [
      ...readStringArray(value.evidenceAnchorIds),
      ...readAnchorIdsFromObjects(value.evidenceAnchors)
    ],
    entityIds: readStringArray(value.entityIds),
    assertionIds: readStringArray(value.assertionIds),
    topicHints: readStringArray(value.topicHints)
  };
}

function normalizeKnowledgeTopicHint(value: unknown): KnowledgeTopicHint | null {
  if (!isRecord(value)) {
    return null;
  }

  const topicSlug = readStringField(value, 'topicSlug') ?? slugify(readStringField(value, 'topic') ?? '');

  if (!topicSlug) {
    return null;
  }

  const confidence = readStringField(value, 'confidence');

  return {
    ...value,
    topicSlug,
    ...(confidence ? { confidence } : {})
  };
}

function buildAssertionText(value: Record<string, unknown>): string | null {
  const subjectEntityId = readStringField(value, 'subjectEntityId');
  const predicate = readStringField(value, 'predicate');
  const object = value.object;

  if (!subjectEntityId || !predicate || object === undefined) {
    return null;
  }

  const serializedObject =
    typeof object === 'string'
      ? object
      : Array.isArray(object)
        ? object.map((entry) => String(entry)).join(', ')
        : JSON.stringify(object);

  return `${subjectEntityId} ${predicate} ${serializedObject}`;
}

function readStringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === 'string' && value[key]!.trim().length > 0 ? String(value[key]) : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readAnchorIdsFromObjects(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const anchorIds: string[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const anchorId = readStringField(entry, 'anchorId') ?? readStringField(entry, 'id') ?? readStringField(entry, 'blockId');

    if (anchorId) {
      anchorIds.push(anchorId);
    }
  }

  return anchorIds;
}

function slugify(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').replace(/^-+|-+$/gu, '');
  return normalized.length > 0 ? normalized : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}
