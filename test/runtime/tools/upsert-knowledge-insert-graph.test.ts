import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import type { KnowledgeInsertGraphWrite } from '../../../src/domain/knowledge-insert-graph-write.js';
import type { GraphDatabaseClient } from '../../../src/storage/graph-database.js';

const saveKnowledgeInsertGraphWrite = vi.fn(async (client: GraphDatabaseClient, graphWrite: KnowledgeInsertGraphWrite) => {
  void client;
  void graphWrite;
});

vi.mock('../../../src/storage/project-env-store.js', () => ({
  loadProjectEnv: vi.fn(async () => ({
    path: '/tmp/project.env',
    contents: 'GRAPH_DATABASE_URL=postgres://graph.example.invalid/llm_wiki_liiy\n',
    values: { GRAPH_DATABASE_URL: 'postgres://graph.example.invalid/llm_wiki_liiy' },
    keys: ['GRAPH_DATABASE_URL']
  }))
}));

vi.mock('../../../src/storage/graph-database.js', () => ({
  resolveGraphDatabaseUrl: vi.fn(() => 'postgres://graph.example.invalid/llm_wiki_liiy'),
  getSharedGraphDatabasePool: vi.fn(() => ({
    query: vi.fn()
  }))
}));

vi.mock('../../../src/storage/save-knowledge-insert-graph-write.js', () => ({
  saveKnowledgeInsertGraphWrite
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('createUpsertKnowledgeInsertGraphTool', () => {
  it('reads deterministic artifacts, writes a graph write artifact, and saves it through the graph pool', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-upsert-knowledge-insert-graph-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'graph-write.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeArtifacts(artifactDirectory);

      const { createUpsertKnowledgeInsertGraphTool } = await import(
        '../../../src/runtime/tools/upsert-knowledge-insert-graph.js'
      );
      const tool = createUpsertKnowledgeInsertGraphTool(
        createRuntimeContext({
          root,
          runId: 'runtime-upsert-knowledge-insert-graph-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
        topicDraftsArtifact: 'state/artifacts/knowledge-insert/run-001/topic-drafts.json',
        sectionsArtifact: 'state/artifacts/knowledge-insert/run-001/sections.json',
        mergedKnowledgeArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
        preparedResourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/graph-write.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8')) as KnowledgeInsertGraphWrite;

      expect(result.details.summary).toBe('upserted knowledge-insert graph write with 7 nodes and 13 edges');
      expect(parsed.nodes.map((node) => node.id)).toEqual(
        expect.arrayContaining([
          'taxonomy:engineering',
          'topic:design-patterns',
          'section:design-patterns#1',
          'entity:patch-first-system',
          'assertion:patch-first-stability',
          'evidence:src-001#1',
          'source:src-001'
        ])
      );
      expect(parsed.edges.map((edge) => edge.type)).toEqual(
        expect.arrayContaining([
          'belongs_to_taxonomy',
          'part_of',
          'grounded_by',
          'derived_from',
          'mentions',
          'about',
          'supported_by'
        ])
      );
      expect(saveKnowledgeInsertGraphWrite).toHaveBeenCalledTimes(1);
      expect(saveKnowledgeInsertGraphWrite.mock.calls[0]?.[1]).toMatchObject({
        sourceId: 'source:src-001'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeArtifacts(artifactDirectory: string): Promise<void> {
  await writeFile(
    path.join(artifactDirectory, 'topic-taxonomy.json'),
    `${JSON.stringify(
      {
        topics: [
          {
            sourceTopicId: 'source-topic-001',
            topicSlug: 'design-patterns',
            topicTitle: 'Design Patterns',
            topicAction: 'reuse-topic',
            sectionIds: ['section-001'],
            taxonomyAction: 'attach-existing',
            taxonomySlug: 'engineering',
            taxonomy: {
              rootTaxonomySlug: 'engineering',
              parentTaxonomySlug: null,
              leafTaxonomySlug: 'engineering'
            },
            conflictTaxonomySlugs: []
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  await writeFile(
    path.join(artifactDirectory, 'topic-drafts.json'),
    `${JSON.stringify(
      {
        topics: [
          {
            topicSlug: 'design-patterns',
            targetPath: 'wiki/topics/design-patterns.md',
            sections: [
              {
                sectionId: 'section-001',
                title: 'Pattern Intent',
                body: 'Patch-first systems keep durable notes.',
                source_refs: ['raw/accepted/design-patterns.md'],
                evidence_anchor_ids: ['anchor-001'],
                locators: ['raw/accepted/design-patterns.md#block-001']
              }
            ],
            upsertArguments: {
              kind: 'topic',
              slug: 'design-patterns',
              title: 'Design Patterns',
              aliases: ['Pattern Intent'],
              summary: 'Pattern overview.',
              tags: ['engineering'],
              source_refs: ['raw/accepted/design-patterns.md'],
              outgoing_links: ['wiki/sources/src-001.md'],
              status: 'active',
              updated_at: '2026-04-23T00:00:00.000Z',
              body: '# Design Patterns\n\n## Pattern Intent\n\nPatch-first systems keep durable notes.\n',
              rationale: 'create deterministic topic draft from insertion plan src-001'
            }
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  await writeFile(
    path.join(artifactDirectory, 'sections.json'),
    `${JSON.stringify(
      {
        sections: [
          {
            sectionId: 'section-001',
            title: 'Pattern Intent',
            summary: 'Patch-first systems keep durable notes.',
            body: 'Patch-first systems keep durable notes.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-001'],
            sourceSectionCandidateIds: ['sec-candidate-001'],
            topicHints: ['design-patterns']
          }
        ]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  await writeFile(
    path.join(artifactDirectory, 'merged.json'),
    `${JSON.stringify(
      {
        inputArtifacts: ['state/artifacts/knowledge-insert/run-001/batches/batch-001.json'],
        entities: [{ entityId: 'patch-first-system', name: 'Patch First System' }],
        assertions: [
          {
            assertionId: 'patch-first-stability',
            text: 'Patch-first writes stay stable.',
            sectionCandidateId: 'sec-candidate-001',
            evidenceAnchorIds: ['anchor-001'],
            entityIds: ['patch-first-system']
          }
        ],
        relations: [],
        evidenceAnchors: [
          {
            anchorId: 'anchor-001',
            blockId: 'block-001',
            quote: 'Patch-first systems keep durable notes.',
            title: 'Patterns intro anchor',
            locator: 'design-patterns.md#introduction:p1',
            order: 1,
            heading_path: ['Introduction']
          }
        ],
        sectionCandidates: [
          {
            sectionCandidateId: 'sec-candidate-001',
            title: 'Pattern Intent',
            summary: 'Patch-first systems keep durable notes.',
            entityIds: ['patch-first-system'],
            assertionIds: ['patch-first-stability'],
            evidenceAnchorIds: ['anchor-001']
          }
        ],
        topicHints: [{ topicSlug: 'design-patterns', confidence: 'high' }]
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  await writeFile(
    path.join(artifactDirectory, 'resource.json'),
    `${JSON.stringify(
      {
        manifestId: 'src-001',
        rawPath: 'raw/accepted/design-patterns.md',
        structuredMarkdown: '# Design Patterns\n\n## Pattern Intent\n\nPatch-first systems keep durable notes.\n',
        sectionHints: [],
        topicHints: ['design-patterns'],
        sections: [{ headingPath: ['Design Patterns', 'Pattern Intent'], startLine: 3, endLine: 5 }],
        metadata: {
          title: 'Design Patterns',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:src-001',
          importedAt: '2026-04-21T00:00:00.000Z',
          preparedAt: '2026-04-23T00:00:00.000Z'
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}
