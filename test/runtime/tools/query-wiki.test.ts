import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createQueryWikiTool } from '../../../src/runtime/tools/query-wiki.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('createQueryWikiTool', () => {
  it('returns query answers without persisting query pages by default', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-query-tool-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(path.join(root, 'raw', 'accepted', 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      const runtimeContext = createRuntimeContext({
        root,
        runId: 'run-runtime-query-001'
      });
      const tool = createQueryWikiTool(runtimeContext);

      const result = await tool.execute('tool-call-1', {
        question: 'what is patch first?',
        persistQueryPage: true
      });

      expect(result.content[0]).toEqual({
        type: 'text',
        text: expect.stringContaining('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.')
      });
      expect(result.details.resultMarkdown).toContain('Synthesis mode: deterministic');
      expect(result.details.resultMarkdown).toContain('Navigation path: wiki/topics/patch-first.md');
      expect(result.details.resultMarkdown).toContain('Raw evidence excerpts: raw/accepted/design.md => Patch-first updates keep page structure stable in source form.');
      expect(result.details.data).toEqual({
        synthesisMode: 'deterministic',
        synthesisFallbackReason: null,
        wikiEvidence: [
          {
            path: 'wiki/topics/patch-first.md',
            kind: 'topic',
            sourceRefs: ['raw/accepted/design.md'],
            matchReasons: expect.arrayContaining(['title:patch', 'title:first'])
          }
        ]
      });
      expect(result.details.touchedFiles).toEqual([]);
      await expect(loadKnowledgePage(root, 'query', 'what-is-patch-first')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows query writeback when runtime context enables it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-query-tool-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });
      await writeFile(path.join(root, 'raw', 'accepted', 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable in source form.\n', 'utf8');
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      const runtimeContext = createRuntimeContext({
        root,
        runId: 'run-runtime-query-002',
        allowQueryWriteback: true
      });
      const tool = createQueryWikiTool(runtimeContext);

      const result = await tool.execute('tool-call-2', {
        question: 'what is patch first?',
        persistQueryPage: true
      });

      expect(result.details.touchedFiles).toEqual(['wiki/queries/what-is-patch-first.md']);
      expect((await loadKnowledgePage(root, 'query', 'what-is-patch-first')).body).toContain(
        'Patch-first updates keep page structure stable.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses an injected synthesizer and records fallback metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-query-tool-'));

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
      const runtimeContext = createRuntimeContext({
        root,
        runId: 'run-runtime-query-003'
      });
      const tool = createQueryWikiTool(runtimeContext, {
        synthesizeAnswer: async ({ wikiEvidence }) => ({
          answer: `Grounded answer from ${wikiEvidence[0]?.path}`,
          mode: 'llm'
        })
      });

      const result = await tool.execute('tool-call-3', {
        question: 'what is patch first?',
        persistQueryPage: false
      });

      expect(result.content[0]).toEqual({ type: 'text', text: 'Grounded answer from wiki/topics/patch-first.md' });
      expect(result.details.resultMarkdown).toContain('Synthesis mode: llm');
      expect(result.details.resultMarkdown).toContain('Synthesis fallback: _none_');
      expect(result.details.data).toEqual({
        synthesisMode: 'llm',
        synthesisFallbackReason: null,
        wikiEvidence: [
          {
            path: 'wiki/topics/patch-first.md',
            kind: 'topic',
            sourceRefs: ['raw/accepted/design.md'],
            matchReasons: expect.arrayContaining(['title:patch', 'title:first'])
          }
        ]
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
