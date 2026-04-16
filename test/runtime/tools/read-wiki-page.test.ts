import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createReadWikiPageTool } from '../../../src/runtime/tools/read-wiki-page.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('createReadWikiPageTool', () => {
  it('reads a wiki page with metadata, backlinks, shared-source relations, and body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-page-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/queries/what-is-patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/navigation-overview.md',
          kind: 'topic',
          title: 'Navigation Overview',
          summary: 'Shows how pages connect.',
          tags: ['navigation'],
          source_refs: ['raw/accepted/overview.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Navigation Overview\n\nShows how pages connect.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/design-memo.md',
          kind: 'source',
          title: 'Design Memo',
          summary: 'Original memo for the patch-first topic.',
          tags: ['memo'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-13T00:00:00.000Z'
        }),
        '# Design Memo\n\nOriginal memo for the patch-first topic.\n'
      );
      const tool = createReadWikiPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-page-001'
        })
      );

      const result = await tool.execute('tool-call-1', { kind: 'topic', slug: 'patch-first' });

      expect(result.details.summary).toBe('read wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('wiki/topics/patch-first.md');
      expect(result.details.evidence).toContain('raw/accepted/design.md');
      expect(result.details.evidence).toContain('wiki/topics/navigation-overview.md');
      expect(result.details.evidence).toContain('wiki/sources/design-memo.md');
      expect(result.details.resultMarkdown).toContain('Suggested source follow-ups: read_raw_source:raw/accepted/design.md');
      expect(result.details.resultMarkdown).toContain('Outgoing links: wiki/queries/what-is-patch-first.md');
      expect(result.details.resultMarkdown).toContain('Incoming links: wiki/topics/navigation-overview.md');
      expect(result.details.resultMarkdown).toContain('Related pages via shared source refs: wiki/sources/design-memo.md');
      expect(result.details.resultMarkdown).toContain('Body:');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
