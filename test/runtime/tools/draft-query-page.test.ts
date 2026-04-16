import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createDraftQueryPageTool } from '../../../src/runtime/tools/draft-query-page.js';
import { saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('createDraftQueryPageTool', () => {
  it('derives a durable query page draft from live query results', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-draft-query-page-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(path.join(root, 'raw', 'accepted', 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const tool = createDraftQueryPageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-draft-query-page-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        question: 'what is patch first?',
        rationale: 'capture a durable query answer'
      });

      expect(result.details.summary).toBe('drafted wiki/queries/what-is-patch-first.md');
      expect(result.details.evidence).toEqual([
        'wiki/queries/what-is-patch-first.md',
        'wiki/topics/patch-first.md',
        'raw/accepted/design.md'
      ]);
      expect(result.details.touchedFiles).toEqual([]);
      expect(result.details.data).toEqual({
        draft: {
          targetPath: 'wiki/queries/what-is-patch-first.md',
          upsertArguments: {
            kind: 'query',
            slug: 'what-is-patch-first',
            title: 'What Is Patch First',
            summary: 'Durable answer for: what is patch first?',
            status: 'active',
            updated_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            body: '# What Is Patch First\n\n## Answer\nPatch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable. Source evidence: raw/accepted/design.md => Patch-first updates keep page structure stable in source form.\n\n## Wiki Evidence\n- wiki/topics/patch-first.md\n\n## Raw Evidence\n- raw/accepted/design.md: Patch-first updates keep page structure stable in source form.',
            rationale: 'capture a durable query answer',
            source_refs: ['raw/accepted/design.md'],
            outgoing_links: ['wiki/topics/patch-first.md'],
            aliases: [],
            tags: ['patch', 'first']
          }
        }
      });
      expect(result.details.resultMarkdown).toContain('# Query Page Draft');
      expect(result.details.resultMarkdown).toContain('- Target: wiki/queries/what-is-patch-first.md');
      expect(result.details.resultMarkdown).toContain('- Preferred next step: apply_draft_upsert');
      expect(result.details.resultMarkdown).toContain('## Proposed Body');
      expect(result.details.resultMarkdown).toContain('## Raw Evidence');
      expect(result.details.resultMarkdown).toContain('## Upsert Arguments');
      expect(result.details.resultMarkdown).toContain('"kind": "query"');
      expect(result.details.resultMarkdown).toContain('"slug": "what-is-patch-first"');
      expect(result.details.resultMarkdown).toContain('raw/accepted/design.md: Patch-first updates keep page structure stable in source form.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
