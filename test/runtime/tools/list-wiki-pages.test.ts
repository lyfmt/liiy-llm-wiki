import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createListWikiPagesTool } from '../../../src/runtime/tools/list-wiki-pages.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('createListWikiPagesTool', () => {
  it('lists wiki pages with navigation metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-list-pages-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          aliases: ['Patch Strategy'],
          summary: 'Patch-first updates keep page structure stable.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/other-topic.md',
          kind: 'topic',
          title: 'Other Topic',
          summary: 'Unrelated material.',
          tags: ['other'],
          source_refs: ['raw/accepted/other.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Other Topic\n\nUnrelated material.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/patch-overview.md',
          kind: 'source',
          title: 'Patch Overview',
          summary: 'Source page linking to the patch-first topic.',
          tags: ['patch'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch Overview\n\nSource page linking to the patch-first topic.\n'
      );
      const tool = createListWikiPagesTool(
        createRuntimeContext({
          root,
          runId: 'runtime-list-pages-001'
        })
      );

      const result = await tool.execute('tool-call-1', { kind: 'topic', query: 'patch strategy', limit: 5 });

      expect(result.details.summary).toBe('listed 1 wiki page(s) for navigation query "patch strategy"');
      expect(result.details.evidence).toEqual(['wiki/topics/patch-first.md']);
      expect(result.details.resultMarkdown).toContain('wiki/topics/patch-first.md');
      expect(result.details.resultMarkdown).toContain('aliases: Patch Strategy');
      expect(result.details.resultMarkdown).toContain('incoming_links: 1');
      expect(result.details.resultMarkdown).toContain('match_score:');
      expect(result.details.resultMarkdown).not.toContain('wiki/topics/other-topic.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
