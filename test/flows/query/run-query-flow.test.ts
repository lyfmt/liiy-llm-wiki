import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../../src/domain/knowledge-page.js';
import { runQueryFlow } from '../../../src/flows/query/run-query-flow.js';
import { loadKnowledgePage, saveKnowledgePage } from '../../../src/storage/knowledge-page-store.js';

describe('runQueryFlow', () => {
  it('answers a query using the most relevant wiki pages and cites their paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

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
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/llm-wiki.md'],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/llm-wiki.md',
          kind: 'topic',
          title: 'LLM Wiki',
          summary: 'The wiki is the long-term knowledge layer.',
          tags: ['wiki'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# LLM Wiki\n\nThe wiki is the long-term knowledge layer.\n'
      );

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: false
      });

      expect(result.answer).toContain('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.');
      expect(result.answer).toContain('LLM Wiki (wiki/topics/llm-wiki.md): The wiki is the long-term knowledge layer.');
      expect(result.answer).toContain('Source evidence: raw/accepted/design.md => Patch-first updates keep page structure stable in source form.');
      expect(result.sources).toEqual(['wiki/topics/patch-first.md', 'wiki/topics/llm-wiki.md']);
      expect(result.rawSources).toEqual(['raw/accepted/design.md']);
      expect(result.rawEvidence).toEqual([
        {
          path: 'raw/accepted/design.md',
          excerpt: 'Patch-first updates keep page structure stable in source form.'
        }
      ]);
      expect(result.wikiEvidence).toHaveLength(2);
      expect(result.wikiEvidence[0]).toEqual(
        expect.objectContaining({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first updates keep page structure stable.',
          bodyExcerpt: 'Patch-first updates keep page structure stable.',
          sourceRefs: ['raw/accepted/design.md'],
          outgoingLinks: ['wiki/topics/llm-wiki.md'],
          matchReasons: expect.arrayContaining(['title:patch', 'title:first'])
        })
      );
      expect(result.wikiEvidence[1]).toEqual(
        expect.objectContaining({
          path: 'wiki/topics/llm-wiki.md',
          kind: 'topic',
          title: 'LLM Wiki',
          summary: 'The wiki is the long-term knowledge layer.',
          bodyExcerpt: 'The wiki is the long-term knowledge layer.',
          sourceRefs: ['raw/accepted/design.md'],
          outgoingLinks: [],
          matchReasons: expect.arrayContaining(['shared-source:raw/accepted/design.md'])
        })
      );
      expect(result.synthesisMode).toBe('deterministic');
      expect(result.synthesisFallbackReason).toBeNull();
      expect(result.changeSet).toBeNull();
      expect(result.review).toEqual({ needs_review: false, reasons: [] });
      expect(result.persistedQueryPage).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists a reusable query page when requested', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

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
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: true
      });

      expect(result.persistedQueryPage).toBe('wiki/queries/what-is-patch-first.md');

      const savedQuery = await loadKnowledgePage(root, 'query', 'what-is-patch-first');
      expect(savedQuery.page.title).toBe('What Is Patch First');
      expect(Array.from(savedQuery.page.summary).length).toBeLessThanOrEqual(30);
      expect(savedQuery.page.summary).toBe('Patch-first updates keep page');
      expect(savedQuery.page.tags).toEqual(['patch-first']);
      expect(savedQuery.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(savedQuery.page.outgoing_links).toEqual(['wiki/topics/patch-first.md']);
      expect(savedQuery.page.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(savedQuery.body).toContain('## Wiki Evidence');
      expect(savedQuery.body).toContain('## Raw Evidence');
      expect(savedQuery.body).toContain('raw/accepted/design.md: Patch-first updates keep page structure stable in source form.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('navigates related pages through backlinks and shared sources after selecting a relevant seed page', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

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
          tags: ['patch-first'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/knowledge-system.md',
          kind: 'topic',
          title: 'Knowledge System Overview',
          summary: 'Shows how the wiki organizes durable knowledge.',
          tags: ['overview'],
          source_refs: ['raw/accepted/overview.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Knowledge System Overview\n\nShows how the wiki organizes durable knowledge.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/design-memo.md',
          kind: 'source',
          title: 'Design Memo',
          summary: 'Source memo used for the current knowledge snapshot.',
          tags: ['memo'],
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# Design Memo\n\nSource memo used for the current knowledge snapshot.\n'
      );

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: false
      });

      expect(result.sources).toEqual([
        'wiki/topics/patch-first.md',
        'wiki/topics/knowledge-system.md',
        'wiki/sources/design-memo.md'
      ]);
      expect(result.answer).toContain('Knowledge System Overview (wiki/topics/knowledge-system.md): Shows how the wiki organizes durable knowledge.');
      expect(result.answer).toContain('Design Memo (wiki/sources/design-memo.md): Source memo used for the current knowledge snapshot.');
      expect(result.rawSources).toEqual(['raw/accepted/design.md']);
      expect(result.wikiEvidence.map((item) => item.path)).toEqual([
        'wiki/topics/patch-first.md',
        'wiki/topics/knowledge-system.md',
        'wiki/sources/design-memo.md'
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns no-result output when nothing relevant is found', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

    try {
      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: false
      });

      expect(result).toEqual({
        answer: 'No relevant wiki pages found.',
        sources: [],
        rawSources: [],
        rawEvidence: [],
        wikiEvidence: [],
        synthesisMode: 'none',
        synthesisFallbackReason: null,
        persistedQueryPage: null,
        changeSet: null,
        review: {
          needs_review: false,
          reasons: []
        }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects persisting a query page when the question tokenizes to an empty slug', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

    try {
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

      await expect(
        runQueryFlow(root, {
          question: '???',
          persistQueryPage: true
        })
      ).rejects.toThrow('Invalid query question: cannot derive query slug');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses a provided synthesizer and records LLM synthesis mode', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

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

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: false,
        synthesizeAnswer: async ({ question, wikiEvidence, rawEvidence }) => ({
          answer: `${question} => ${wikiEvidence[0]?.path} + ${rawEvidence[0]?.path}`,
          mode: 'llm'
        })
      });

      expect(result.answer).toBe('what is patch first? => wiki/topics/patch-first.md + raw/accepted/design.md');
      expect(result.synthesisMode).toBe('llm');
      expect(result.synthesisFallbackReason).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to deterministic synthesis when the provided synthesizer fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-query-'));

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

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: false,
        synthesizeAnswer: async () => {
          throw new Error('synthetic llm failure');
        }
      });

      expect(result.answer).toContain('Patch First (wiki/topics/patch-first.md): Patch-first updates keep page structure stable.');
      expect(result.synthesisMode).toBe('deterministic');
      expect(result.synthesisFallbackReason).toBe('synthetic llm failure');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
