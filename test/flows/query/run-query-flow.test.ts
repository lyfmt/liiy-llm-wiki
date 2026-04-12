import { mkdtemp, rm } from 'node:fs/promises';
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
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
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

      expect(result.answer).toContain('Patch-first updates keep page structure stable.');
      expect(result.sources).toEqual(['wiki/topics/patch-first.md']);
      expect(result.persistedQueryPage).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists a reusable query page when requested', async () => {
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

      const result = await runQueryFlow(root, {
        question: 'what is patch first?',
        persistQueryPage: true
      });

      expect(result.persistedQueryPage).toBe('wiki/queries/what-is-patch-first.md');

      const savedQuery = await loadKnowledgePage(root, 'query', 'what-is-patch-first');
      expect(savedQuery.page.title).toBe('What Is Patch First');
      expect(savedQuery.page.source_refs).toEqual(['raw/accepted/design.md']);
      expect(savedQuery.page.outgoing_links).toEqual(['wiki/topics/patch-first.md']);
      expect(savedQuery.page.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(savedQuery.body).toContain('Patch-first updates keep page structure stable.');
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
        persistedQueryPage: null
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
});
