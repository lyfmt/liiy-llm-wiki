import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createAuditTaxonomyHostingTool } from '../../../src/runtime/tools/audit-taxonomy-hosting.js';

describe('createAuditTaxonomyHostingTool', () => {
  it('fails when topic taxonomy planning still leaves topics out of the taxonomy tree', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-taxonomy-hosting-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
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
              },
              {
                sourceTopicId: 'source-topic-002',
                topicSlug: 'pattern-constraints',
                topicTitle: 'Pattern Constraints',
                topicAction: 'create-topic',
                sectionIds: ['section-002'],
                taxonomyAction: 'conflict',
                taxonomySlug: null,
                taxonomy: {
                  rootTaxonomySlug: null,
                  parentTaxonomySlug: null,
                  leafTaxonomySlug: null
                },
                conflictTaxonomySlugs: ['engineering', 'architecture']
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createAuditTaxonomyHostingTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-taxonomy-hosting-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-host-audit.json'
      });

      expect(result.details.summary).toBe('taxonomy host audit failed');
      const taxonomy = readTaxonomyAuditData(result.details.data);
      expect(taxonomy.unhostedTopicSlugs).toEqual(['pattern-constraints']);
      expect(taxonomy.canWriteGraph).toBe(false);
      expect(taxonomy.canWriteWiki).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('passes when every topic has a stable taxonomy root-parent-leaf placement', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-taxonomy-hosting-pass-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
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
              },
              {
                sourceTopicId: 'source-topic-002',
                topicSlug: 'pattern-constraints',
                topicTitle: 'Pattern Constraints',
                topicAction: 'create-topic',
                sectionIds: ['section-002'],
                taxonomyAction: 'create-taxonomy-node',
                taxonomySlug: 'patterns',
                taxonomy: {
                  rootTaxonomySlug: 'engineering',
                  parentTaxonomySlug: 'engineering',
                  leafTaxonomySlug: 'patterns'
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

      const tool = createAuditTaxonomyHostingTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-taxonomy-hosting-pass-001'
        })
      );

      const result = await tool.execute('tool-call-2', {
        topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-host-audit.json'
      });

      expect(result.details.summary).toBe('taxonomy host audit passed');
      const taxonomy = readTaxonomyAuditData(result.details.data);
      expect(taxonomy.unhostedTopicSlugs).toEqual([]);
      expect(taxonomy.canWriteGraph).toBe(true);
      expect(taxonomy.canWriteWiki).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('treats a newly created taxonomy root as hosted when root and leaf are the same node', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-taxonomy-hosting-root-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'topic-taxonomy.json'),
        `${JSON.stringify(
          {
            topics: [
              {
                sourceTopicId: 'source-topic-003',
                topicSlug: 'quality-gates',
                topicTitle: 'Quality Gates',
                topicAction: 'create-topic',
                sectionIds: ['section-003'],
                taxonomyAction: 'create-taxonomy-node',
                taxonomySlug: 'quality-gates',
                taxonomy: {
                  rootTaxonomySlug: 'quality-gates',
                  parentTaxonomySlug: null,
                  leafTaxonomySlug: 'quality-gates'
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

      const tool = createAuditTaxonomyHostingTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-taxonomy-hosting-root-001'
        })
      );

      const result = await tool.execute('tool-call-3', {
        topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-host-audit.json'
      });

      expect(result.details.summary).toBe('taxonomy host audit passed');
      const taxonomy = readTaxonomyAuditData(result.details.data);
      expect(taxonomy.unhostedTopicSlugs).toEqual([]);
      expect(taxonomy.canWriteGraph).toBe(true);
      expect(taxonomy.canWriteWiki).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails when an attached topic reports a leaf taxonomy that differs from taxonomySlug', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-taxonomy-hosting-leaf-mismatch-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'topic-taxonomy.json'),
        `${JSON.stringify(
          {
            topics: [
              {
                sourceTopicId: 'source-topic-010',
                topicSlug: 'design-patterns',
                topicTitle: 'Design Patterns',
                topicAction: 'reuse-topic',
                sectionIds: ['section-010'],
                taxonomyAction: 'attach-existing',
                taxonomySlug: 'engineering',
                taxonomy: {
                  rootTaxonomySlug: 'engineering',
                  parentTaxonomySlug: 'engineering',
                  leafTaxonomySlug: 'patterns'
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

      const tool = createAuditTaxonomyHostingTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-taxonomy-hosting-leaf-mismatch-001'
        })
      );

      const result = await tool.execute('tool-call-4', {
        topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-host-audit.json'
      });

      expect(result.details.summary).toBe('taxonomy host audit failed');
      expect(readTaxonomyAuditData(result.details.data).unhostedTopicSlugs).toEqual(['design-patterns']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails when a non-root leaf taxonomy is missing parent placement metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-taxonomy-hosting-parent-missing-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'topic-taxonomy.json'),
        `${JSON.stringify(
          {
            topics: [
              {
                sourceTopicId: 'source-topic-011',
                topicSlug: 'object-pool-pattern',
                topicTitle: 'Object Pool Pattern',
                topicAction: 'create-topic',
                sectionIds: ['section-011'],
                taxonomyAction: 'merge-into-existing',
                taxonomySlug: 'patterns',
                taxonomy: {
                  rootTaxonomySlug: 'engineering',
                  parentTaxonomySlug: null,
                  leafTaxonomySlug: 'patterns'
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

      const tool = createAuditTaxonomyHostingTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-taxonomy-hosting-parent-missing-001'
        })
      );

      const result = await tool.execute('tool-call-5', {
        topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-host-audit.json'
      });

      expect(result.details.summary).toBe('taxonomy host audit failed');
      expect(readTaxonomyAuditData(result.details.data).unhostedTopicSlugs).toEqual(['object-pool-pattern']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects the artifact when topicAction or taxonomyAction is unknown', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-taxonomy-hosting-invalid-action-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'topic-taxonomy.json'),
        `${JSON.stringify(
          {
            topics: [
              {
                sourceTopicId: 'source-topic-012',
                topicSlug: 'design-patterns',
                topicTitle: 'Design Patterns',
                topicAction: 'reuse-topic-ish',
                sectionIds: ['section-012'],
                taxonomyAction: 'attach-ish',
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

      const tool = createAuditTaxonomyHostingTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-taxonomy-hosting-invalid-action-001'
        })
      );

      await expect(
        tool.execute('tool-call-6', {
          topicTaxonomyArtifact: 'state/artifacts/knowledge-insert/run-001/topic-taxonomy.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/taxonomy-host-audit.json'
        })
      ).rejects.toThrow('Invalid topic taxonomy artifact');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function readTaxonomyAuditData(data: Record<string, unknown> | undefined): {
  unhostedTopicSlugs: string[];
  canWriteGraph: boolean;
  canWriteWiki: boolean;
} {
  const taxonomy = data?.taxonomy;

  if (
    typeof taxonomy !== 'object' ||
    taxonomy === null ||
    !Array.isArray((taxonomy as { unhostedTopicSlugs?: unknown }).unhostedTopicSlugs) ||
    typeof (taxonomy as { canWriteGraph?: unknown }).canWriteGraph !== 'boolean' ||
    typeof (taxonomy as { canWriteWiki?: unknown }).canWriteWiki !== 'boolean'
  ) {
    throw new Error('Invalid taxonomy audit test data');
  }

  return taxonomy as {
    unhostedTopicSlugs: string[];
    canWriteGraph: boolean;
    canWriteWiki: boolean;
  };
}
