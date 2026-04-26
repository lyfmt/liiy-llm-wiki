import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createResolveTopicTaxonomyTool } from '../../../src/runtime/tools/resolve-topic-taxonomy.js';

describe('createResolveTopicTaxonomyTool', () => {
  it('attaches reused topics to existing taxonomy roots and proposes new taxonomy nodes for new topics', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-topic-taxonomy-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'topic-taxonomy.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'source-topics.json'),
        `${JSON.stringify(
          {
            sourceTopics: [
              {
                sourceTopicId: 'source-topic-001',
                decision: 'reuse-topic',
                topicSlug: 'design-patterns',
                topicTitle: 'Design Patterns',
                sectionIds: ['section-001', 'section-002']
              },
              {
                sourceTopicId: 'source-topic-002',
                decision: 'create-topic',
                topicSlug: 'pattern-constraints',
                topicTitle: 'Pattern Constraints',
                sectionIds: ['section-003']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'taxonomy-catalog.json'),
        `${JSON.stringify(
          {
            taxonomy: [
              {
                taxonomySlug: 'engineering',
                title: 'Engineering',
                aliases: ['Design Patterns'],
                summary: 'Engineering root taxonomy.',
                parentTaxonomySlug: null,
                rootTaxonomySlug: 'engineering',
                isRoot: true
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveTopicTaxonomyTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-topic-taxonomy-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
        taxonomyCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('resolved taxonomy hosting for 2 topics');
      expect(parsed.topics[0]).toEqual(
        expect.objectContaining({
          topicSlug: 'design-patterns',
          taxonomyAction: 'attach-existing',
          taxonomySlug: 'engineering',
          taxonomy: expect.objectContaining({
            rootTaxonomySlug: 'engineering',
            parentTaxonomySlug: null,
            leafTaxonomySlug: 'engineering'
          })
        })
      );
      expect(parsed.topics[1]).toEqual(
        expect.objectContaining({
          topicSlug: 'pattern-constraints',
          taxonomyAction: 'create-taxonomy-node',
          taxonomySlug: 'patterns',
          taxonomy: expect.objectContaining({
            rootTaxonomySlug: 'engineering',
            parentTaxonomySlug: 'engineering',
            leafTaxonomySlug: 'patterns'
          })
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('merges new topics into matching taxonomy nodes and preserves taxonomy conflicts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-topic-taxonomy-merge-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'topic-taxonomy.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'source-topics.json'),
        `${JSON.stringify(
          {
            sourceTopics: [
              {
                sourceTopicId: 'source-topic-003',
                decision: 'create-topic',
                topicSlug: 'object-pool-pattern',
                topicTitle: 'Object Pool Pattern',
                sectionIds: ['section-004']
              },
              {
                sourceTopicId: 'source-topic-004',
                decision: 'conflict',
                topicSlug: 'distributed-systems',
                topicTitle: 'Distributed Systems',
                sectionIds: ['section-005']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'taxonomy-catalog.json'),
        `${JSON.stringify(
          {
            taxonomy: [
              {
                taxonomySlug: 'engineering',
                title: 'Engineering',
                aliases: [],
                summary: 'Engineering root taxonomy.',
                parentTaxonomySlug: null,
                rootTaxonomySlug: 'engineering',
                isRoot: true
              },
              {
                taxonomySlug: 'patterns',
                title: 'Patterns',
                aliases: ['Object Pool Pattern'],
                summary: 'Patterns taxonomy.',
                parentTaxonomySlug: 'engineering',
                rootTaxonomySlug: 'engineering',
                isRoot: false
              },
              {
                taxonomySlug: 'architecture',
                title: 'Architecture',
                aliases: [],
                summary: 'Architecture root taxonomy.',
                parentTaxonomySlug: null,
                rootTaxonomySlug: 'architecture',
                isRoot: true
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveTopicTaxonomyTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-topic-taxonomy-merge-001'
        })
      );

      await tool.execute('tool-call-2', {
        sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
        taxonomyCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.topics[0]).toEqual(
        expect.objectContaining({
          topicSlug: 'object-pool-pattern',
          taxonomyAction: 'merge-into-existing',
          taxonomySlug: 'patterns',
          taxonomy: expect.objectContaining({
            rootTaxonomySlug: 'engineering',
            parentTaxonomySlug: 'engineering',
            leafTaxonomySlug: 'patterns'
          })
        })
      );
      expect(parsed.topics[1]).toEqual(
        expect.objectContaining({
          topicSlug: 'distributed-systems',
          taxonomyAction: 'conflict',
          taxonomySlug: null,
          taxonomy: expect.objectContaining({
            rootTaxonomySlug: null,
            parentTaxonomySlug: null,
            leafTaxonomySlug: null
          }),
          conflictTaxonomySlugs: []
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('marks a topic as conflict when direct and inferred taxonomy matches disagree', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-topic-taxonomy-disagree-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'topic-taxonomy.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'source-topics.json'),
        `${JSON.stringify(
          {
            sourceTopics: [
              {
                sourceTopicId: 'source-topic-005',
                decision: 'create-topic',
                topicSlug: 'object-pool-pattern',
                topicTitle: 'Object Pool Pattern',
                sectionIds: ['section-006']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'taxonomy-catalog.json'),
        `${JSON.stringify(
          {
            taxonomy: [
              {
                taxonomySlug: 'runtime-pools',
                title: 'Runtime Pools',
                aliases: ['Object Pool Pattern'],
                summary: 'Runtime pool taxonomy.',
                parentTaxonomySlug: 'engineering',
                rootTaxonomySlug: 'engineering',
                isRoot: false
              },
              {
                taxonomySlug: 'patterns',
                title: 'Patterns',
                aliases: [],
                summary: 'Patterns taxonomy.',
                parentTaxonomySlug: 'engineering',
                rootTaxonomySlug: 'engineering',
                isRoot: false
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveTopicTaxonomyTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-topic-taxonomy-disagree-001'
        })
      );

      await tool.execute('tool-call-3', {
        sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
        taxonomyCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.topics[0]).toEqual(
        expect.objectContaining({
          topicSlug: 'object-pool-pattern',
          taxonomyAction: 'conflict',
          taxonomySlug: null,
          conflictTaxonomySlugs: ['runtime-pools', 'patterns'],
          taxonomy: expect.objectContaining({
            rootTaxonomySlug: null,
            parentTaxonomySlug: null,
            leafTaxonomySlug: null
          })
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('marks a create-topic as conflict when multiple roots exist and no taxonomy match is available', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-resolve-topic-taxonomy-multi-root-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      const outputArtifactPath = path.join(artifactDirectory, 'topic-taxonomy.json');
      await mkdir(artifactDirectory, { recursive: true });

      await writeFile(
        path.join(artifactDirectory, 'source-topics.json'),
        `${JSON.stringify(
          {
            sourceTopics: [
              {
                sourceTopicId: 'source-topic-006',
                decision: 'create-topic',
                topicSlug: 'quality-gates',
                topicTitle: 'Quality Gates',
                sectionIds: ['section-007']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'taxonomy-catalog.json'),
        `${JSON.stringify(
          {
            taxonomy: [
              {
                taxonomySlug: 'engineering',
                title: 'Engineering',
                aliases: [],
                summary: 'Engineering root taxonomy.',
                parentTaxonomySlug: null,
                rootTaxonomySlug: 'engineering',
                isRoot: true
              },
              {
                taxonomySlug: 'architecture',
                title: 'Architecture',
                aliases: [],
                summary: 'Architecture root taxonomy.',
                parentTaxonomySlug: null,
                rootTaxonomySlug: 'architecture',
                isRoot: true
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createResolveTopicTaxonomyTool(
        createRuntimeContext({
          root,
          runId: 'runtime-resolve-topic-taxonomy-multi-root-001'
        })
      );

      await tool.execute('tool-call-4', {
        sourceTopicsArtifact: 'state/artifacts/knowledge-insert/run-001/source-topics.json',
        taxonomyCatalogArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-catalog.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json'
      });
      const parsed = JSON.parse(await readFile(outputArtifactPath, 'utf8'));

      expect(parsed.topics[0]).toEqual(
        expect.objectContaining({
          topicSlug: 'quality-gates',
          taxonomyAction: 'conflict',
          taxonomySlug: null,
          conflictTaxonomySlugs: [],
          taxonomy: expect.objectContaining({
            rootTaxonomySlug: null,
            parentTaxonomySlug: null,
            leafTaxonomySlug: null
          })
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
