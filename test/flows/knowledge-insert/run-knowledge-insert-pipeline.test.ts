import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { runKnowledgeInsertPipeline } from '../../../src/flows/knowledge-insert/run-knowledge-insert-pipeline.js';
import type { GraphDatabaseClient } from '../../../src/storage/graph-database.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('runKnowledgeInsertPipeline', () => {
  it('prepares source and materializes parts from a valid partition plan', async () => {
    const root = await createSourceRoot();

    try {
      const result = await runKnowledgeInsertPipeline(root, {
        runId: 'run-001',
        sourceId: 'src-001',
        stageGenerators: singlePartGenerators(),
        stopAfter: 'parts.materialized'
      });

      expect(result.artifacts.parts).toBe('state/artifacts/knowledge-insert-pipeline/run-001/parts.json');
      const parts = JSON.parse(await readFile(path.join(root, result.artifacts.parts), 'utf8'));
      expect(parts.parts[0]).toEqual(expect.objectContaining({ text: '# Heading\nLine one', startLine: 1, endLine: 2 }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('plans source chunks independently while preserving global line numbers', async () => {
    const root = await createSourceRoot({
      markdown: Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join('\n') + '\n'
    });
    const plannedRanges: Array<{ startLine: number; endLine: number }> = [];

    try {
      const result = await runKnowledgeInsertPipeline(root, {
        runId: 'run-chunked-partition',
        sourceId: 'src-001',
        stageGenerators: {
          'topics.planned': async () => JSON.stringify(topicPlan()),
          'parts.planned': async (prompt) => {
            const parsed = JSON.parse(prompt.slice(prompt.indexOf('Input JSON:') + 'Input JSON:'.length));
            const lineIndex = parsed.sourceResource.lineIndex as Array<{ line: number }>;
            const startLine = lineIndex[0]!.line;
            const endLine = lineIndex.at(-1)!.line;
            plannedRanges.push({ startLine, endLine });
            return JSON.stringify({
              schemaVersion: 'knowledge-insert.partition-plan.v3',
              sourceId: 'src-001',
              parts: [{
                partId: `local-${startLine}`,
                title: `Lines ${startLine}-${endLine}`,
                startLine,
                endLine,
                topicIds: ['topic-a'],
                rationale: 'Chunk-local plan with global line numbers'
              }]
            });
          },
          'parts.extracted': async () => JSON.stringify(emptyExtraction('part-001'))
        },
        partitionChunkMaxChars: 160,
        stopAfter: 'parts.materialized'
      });

      const parts = JSON.parse(await readFile(path.join(root, result.artifacts.parts), 'utf8'));

      expect(plannedRanges.length).toBeGreaterThan(1);
      expect(parts.parts.at(-1)).toEqual(expect.objectContaining({ endLine: 80 }));
      expect(parts.parts.map((part: { partId: string }) => part.partId)).toEqual([
        ...plannedRanges.map((_, index) => `part-${String(index + 1).padStart(3, '0')}`)
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('retries topic planning by recursively splitting the source after a full-book failure', async () => {
    const root = await createSourceRoot({
      markdown: Array.from({ length: 8 }, (_, index) => `Line ${index + 1}`).join('\n') + '\n'
    });
    const topicRanges: Array<{ startLine: number; endLine: number }> = [];

    try {
      const result = await runKnowledgeInsertPipeline(root, {
        runId: 'run-adaptive-topic-plan',
        sourceId: 'src-001',
        stageGenerators: {
          'topics.planned': async (prompt) => {
            const parsed = JSON.parse(prompt.slice(prompt.indexOf('Input JSON:') + 'Input JSON:'.length));
            const lineIndex = parsed.lineIndex as Array<{ line: number }>;
            const startLine = lineIndex[0]!.line;
            const endLine = lineIndex.at(-1)!.line;
            topicRanges.push({ startLine, endLine });

            if (startLine === 1 && endLine === 8) {
              throw new Error('context length exceeded');
            }

            return JSON.stringify({
              schemaVersion: 'knowledge-insert.topic-plan.v3',
              sourceId: 'src-001',
              topics: [{
                topicId: `topic-lines-${startLine}-${endLine}`,
                slug: `lines-${startLine}-${endLine}`,
                title: `Lines ${startLine}-${endLine}`,
                scope: 'Chunk topic',
                rationale: 'Created after adaptive split'
              }]
            });
          },
          'parts.planned': async () => JSON.stringify({
            schemaVersion: 'knowledge-insert.partition-plan.v3',
            sourceId: 'src-001',
            parts: [{ partId: 'part-001', title: 'All', startLine: 1, endLine: 8, topicIds: ['topic-lines-1-4'], rationale: 'All lines' }]
          }),
          'parts.extracted': async () => JSON.stringify(emptyExtraction('part-001'))
        },
        stopAfter: 'topics.planned'
      });

      const topicPlan = JSON.parse(await readFile(path.join(root, result.artifacts.topicPlan), 'utf8'));

      expect(topicRanges).toEqual([
        { startLine: 1, endLine: 8 },
        { startLine: 1, endLine: 4 },
        { startLine: 5, endLine: 8 }
      ]);
      expect(topicPlan.topics.map((topic: { topicId: string }) => topic.topicId)).toEqual([
        'topic-lines-1-4',
        'topic-lines-5-8'
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('connects extracted sections to topics, entities, concepts, and evidence', async () => {
    const root = await createSourceRoot();

    try {
      const result = await runKnowledgeInsertPipeline(root, {
        runId: 'run-002',
        sourceId: 'src-001',
        stageGenerators: twoPartGenerators(),
        stopAfter: 'knowledge.connected'
      });

      const connected = JSON.parse(await readFile(path.join(root, result.artifacts.connectedKnowledge), 'utf8'));

      expect(connected.topics).toHaveLength(1);
      expect(connected.sections[0]).toEqual(expect.objectContaining({
        topicIds: ['topic-a'],
        conceptIds: ['concept-thread-local-context-propagation']
      }));
      expect(connected.concepts).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips existing part extractions, persists progress, and limits extraction concurrency', async () => {
    const root = await createSourceRoot({
      markdown: '# Heading\nLine one\nLine two\nLine three\nLine four\nLine five\n'
    });
    let activeExtractions = 0;
    let maxActiveExtractions = 0;
    const generatedParts: string[] = [];

    try {
      await mkdir(path.join(root, 'state', 'artifacts', 'knowledge-insert-pipeline', 'run-resume-concurrent', 'part-extractions'), { recursive: true });
      await writeFile(
        path.join(root, 'state', 'artifacts', 'knowledge-insert-pipeline', 'run-resume-concurrent', 'part-extractions', 'part-001.json'),
        JSON.stringify(extraction('part-001', 'section-001'), null, 2),
        'utf8'
      );

      const result = await runKnowledgeInsertPipeline(root, {
        runId: 'run-resume-concurrent',
        sourceId: 'src-001',
        stageGenerators: {
          'topics.planned': async () => JSON.stringify(topicPlan()),
          'parts.planned': async () => JSON.stringify({
            schemaVersion: 'knowledge-insert.partition-plan.v3',
            sourceId: 'src-001',
            parts: [
              { partId: 'part-001', title: 'One', startLine: 1, endLine: 2, topicIds: ['topic-a'], rationale: 'Existing' },
              { partId: 'part-002', title: 'Two', startLine: 3, endLine: 3, topicIds: ['topic-a'], rationale: 'Generate' },
              { partId: 'part-003', title: 'Three', startLine: 4, endLine: 4, topicIds: ['topic-a'], rationale: 'Generate' },
              { partId: 'part-004', title: 'Four', startLine: 5, endLine: 6, topicIds: ['topic-a'], rationale: 'Generate' }
            ]
          }),
          'parts.extracted': async (prompt) => {
            const parsed = JSON.parse(prompt.slice(prompt.indexOf('Input JSON:') + 'Input JSON:'.length));
            const partId = parsed.partId as string;
            generatedParts.push(partId);
            activeExtractions += 1;
            maxActiveExtractions = Math.max(maxActiveExtractions, activeExtractions);
            await new Promise((resolve) => setTimeout(resolve, 10));
            activeExtractions -= 1;
            return JSON.stringify(extraction(partId, `section-${partId}`));
          }
        },
        maxPartExtractionConcurrency: 2,
        stopAfter: 'parts.extracted'
      });

      const state = JSON.parse(await readFile(path.join(root, 'state', 'artifacts', 'knowledge-insert-pipeline', 'run-resume-concurrent', 'pipeline-state.json'), 'utf8'));

      expect(generatedParts).toEqual(expect.arrayContaining(['part-002', 'part-003', 'part-004']));
      expect(generatedParts).not.toContain('part-001');
      expect(maxActiveExtractions).toBeLessThanOrEqual(2);
      expect(result.state.currentStage).toBe('parts.extracted');
      expect(state.partProgress).toEqual({ total: 4, completed: 4, running: [], pending: 0 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('merges repeated entity and concept IDs emitted by independent part extractions', async () => {
    const root = await createSourceRoot();

    try {
      const result = await runKnowledgeInsertPipeline(root, {
        runId: 'run-duplicate-knowledge',
        sourceId: 'src-001',
        stageGenerators: duplicateKnowledgeGenerators(),
        stopAfter: 'knowledge.connected'
      });

      const connected = JSON.parse(await readFile(path.join(root, result.artifacts.connectedKnowledge), 'utf8'));

      expect(connected.entities).toEqual([expect.objectContaining({
        entityId: 'entity-threadlocal',
        name: 'ThreadLocal',
        summary: 'A more complete description of Java thread-local storage across concurrent execution contexts.',
        aliases: ['Thread Local API', 'ThreadLocal API']
      })]);
      expect(connected.concepts).toEqual([expect.objectContaining({
        conceptId: 'concept-thread-local-context-propagation',
        summary: 'A longer summary about propagating thread-local context through concurrent execution boundaries.'
      })]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes graph as pg-primary before wiki projection', async () => {
    const root = await createSourceRoot();
    const fakeGraphClient = createMemoryGraphClient();

    try {
      const result = await runKnowledgeInsertPipeline(root, {
        runId: 'run-003',
        sourceId: 'src-001',
        graphClient: fakeGraphClient,
        stageGenerators: successfulGenerators(),
        stopAfter: 'graph.written'
      });

      expect(result.state.storageMode).toBe('pg-primary');
      expect(fakeGraphClient.nodeUpserts.map((call) => call.id)).toEqual(expect.arrayContaining(['source:src-001']));
      expect(result.state.currentStage).toBe('graph.written');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createSourceRoot(options?: { markdown?: string }): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-pipeline-'));
  await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
  await writeFile(path.join(root, 'raw', 'accepted', 'source.md'), options?.markdown ?? '# Heading\nLine one\nLine two\nLine three\n', 'utf8');
  await saveSourceManifest(root, createSourceManifest({
    id: 'src-001',
    path: 'raw/accepted/source.md',
    title: 'Source',
    type: 'markdown',
    status: 'accepted',
    hash: 'sha256:test',
    imported_at: '2026-04-25T00:00:00.000Z'
  }));
  return root;
}

function singlePartGenerators() {
  return {
    'topics.planned': async () => JSON.stringify(topicPlan()),
    'parts.planned': async () => JSON.stringify({
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: 'src-001',
      parts: [{ partId: 'part-001', title: 'Intro', startLine: 1, endLine: 2, topicIds: ['topic-a'], rationale: 'Opening' }]
    }),
    'parts.extracted': async () => JSON.stringify(emptyExtraction('part-001'))
  };
}

function twoPartGenerators() {
  let partIndex = 0;
  return {
    'topics.planned': async () => JSON.stringify(topicPlan()),
    'parts.planned': async () => JSON.stringify({
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: 'src-001',
      parts: [
        { partId: 'part-001', title: 'One', startLine: 1, endLine: 2, topicIds: ['topic-a'], rationale: 'Opening' },
        { partId: 'part-002', title: 'Two', startLine: 3, endLine: 4, topicIds: ['topic-a'], rationale: 'Continuation' }
      ]
    }),
    'parts.extracted': async () => JSON.stringify(partIndex++ === 0 ? extraction('part-001', 'section-001') : extraction('part-002', 'section-002'))
  };
}

function successfulGenerators() {
  return twoPartGenerators();
}

function duplicateKnowledgeGenerators() {
  let partIndex = 0;
  return {
    'topics.planned': async () => JSON.stringify(topicPlan()),
    'parts.planned': async () => JSON.stringify({
      schemaVersion: 'knowledge-insert.partition-plan.v3',
      sourceId: 'src-001',
      parts: [
        { partId: 'part-001', title: 'One', startLine: 1, endLine: 2, topicIds: ['topic-a'], rationale: 'Opening' },
        { partId: 'part-002', title: 'Two', startLine: 3, endLine: 4, topicIds: ['topic-a'], rationale: 'Continuation' }
      ]
    }),
    'parts.extracted': async () => JSON.stringify(partIndex++ === 0
      ? extraction('part-001', 'section-001')
      : {
          ...extraction('part-002', 'section-002'),
          entities: [{
            entityId: 'entity-threadlocal',
            name: 'ThreadLocal API',
            summary: 'A more complete description of Java thread-local storage across concurrent execution contexts.',
            aliases: ['Thread Local API']
          }],
          concepts: [{
            conceptId: 'concept-thread-local-context-propagation',
            name: '线程局部上下文传播',
            summary: 'A longer summary about propagating thread-local context through concurrent execution boundaries.',
            aliases: []
          }]
        })
  };
}

function topicPlan() {
  return {
    schemaVersion: 'knowledge-insert.topic-plan.v3',
    sourceId: 'src-001',
    topics: [{ topicId: 'topic-a', slug: 'topic-a', title: 'Topic A', scope: 'Scope', rationale: 'Because' }]
  };
}

function emptyExtraction(partId: string) {
  return {
    schemaVersion: 'knowledge-insert.part-extraction.v3',
    sourceId: 'src-001',
    partId,
    sections: [],
    entities: [],
    concepts: [],
    evidenceAnchors: []
  };
}

function extraction(partId: string, sectionId: string) {
  return {
    schemaVersion: 'knowledge-insert.part-extraction.v3',
    sourceId: 'src-001',
    partId,
    sections: [{
      sectionId,
      title: 'Thread context propagation',
      body: 'Thread context can be propagated across creation boundaries.',
      topicIds: ['topic-a'],
      entityIds: ['entity-threadlocal'],
      conceptIds: ['concept-thread-local-context-propagation'],
      evidenceAnchorIds: [`evidence-${partId}`]
    }],
    entities: [{
      entityId: 'entity-threadlocal',
      name: 'ThreadLocal',
      summary: 'Java thread-local storage API.',
      aliases: []
    }],
    concepts: [{
      conceptId: 'concept-thread-local-context-propagation',
      name: '线程局部上下文传播',
      summary: '在并发执行边界上传递上下文信息的机制。',
      aliases: []
    }],
    evidenceAnchors: [{
      anchorId: `evidence-${partId}`,
      locator: `raw/accepted/source.md#L1-L2`,
      quote: 'Line one',
      startLine: 1,
      endLine: 2
    }]
  };
}

function createMemoryGraphClient(): GraphDatabaseClient & {
  nodeUpserts: Array<{ id: string }>;
  edgeUpserts: Array<{ edge_id: string }>;
} {
  const client: GraphDatabaseClient & {
    nodeUpserts: Array<{ id: string }>;
    edgeUpserts: Array<{ edge_id: string }>;
  } = {
    nodeUpserts: [] as Array<{ id: string }>,
    edgeUpserts: [] as Array<{ edge_id: string }>,
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('insert into graph_nodes')) {
        client.nodeUpserts.push({ id: params?.[0] as string });
        return { rows: [{ inserted: true }] };
      }
      if (sql.includes('insert into graph_edges')) {
        client.edgeUpserts.push({ edge_id: params?.[0] as string });
        return { rows: [{ inserted: true }] };
      }
      return { rows: [] };
    },
    async transaction<T>(work: (transactionClient: typeof client) => Promise<T>): Promise<T> {
      return work(client);
    }
  };
  return client;
}
