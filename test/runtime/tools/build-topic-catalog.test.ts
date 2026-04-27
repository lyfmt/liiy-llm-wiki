import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createBuildTopicCatalogTool } from '../../../src/runtime/tools/build-topic-catalog.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('createBuildTopicCatalogTool', () => {
  it('builds a topic catalog artifact from wiki topic pages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-build-topic-catalog-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/design-patterns.md',
          kind: 'topic',
          title: 'Design Patterns',
          aliases: ['Pattern Intent'],
          summary: 'Durable design language',
          tags: ['patterns'],
          source_refs: ['raw/accepted/design-patterns.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-23T00:00:00.000Z'
        }),
        '# Design Patterns\n\nDurable design language.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/review-gates.md',
          kind: 'topic',
          title: 'Review Gates',
          aliases: [],
          summary: 'Risky write escalation',
          tags: ['review'],
          source_refs: ['raw/accepted/review-gates.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-23T00:00:00.000Z'
        }),
        '# Review Gates\n\nRisky write escalation.\n'
      );

      const tool = createBuildTopicCatalogTool(
        createRuntimeContext({
          root,
          runId: 'runtime-build-topic-catalog-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/topic-catalog.json'
      });
      const parsed = JSON.parse(
        await readFile(path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'topic-catalog.json'), 'utf8')
      );

      expect(result.details.summary).toBe('built topic catalog for 2 topics');
      expect(parsed.topics[0]).toEqual(
        expect.objectContaining({
          topicSlug: 'design-patterns',
          title: 'Design Patterns',
          aliases: ['Pattern Intent'],
          summary: 'Durable design language',
          source_refs: ['raw/accepted/design-patterns.md']
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
