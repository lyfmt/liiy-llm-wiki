import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../src/domain/knowledge-page.js';

describe('createKnowledgePage', () => {
  it('creates a knowledge page with exact spec field names', () => {
    const page = createKnowledgePage({
      path: 'wiki/topics/llm-wiki.md',
      kind: 'topic',
      title: 'LLM Wiki',
      source_refs: ['raw/inbox/example.md'],
      status: 'active',
      updated_at: '2026-04-11T00:00:00.000Z'
    });

    expect(page).toEqual({
      path: 'wiki/topics/llm-wiki.md',
      kind: 'topic',
      title: 'LLM Wiki',
      aliases: [],
      summary: '',
      tags: [],
      source_refs: ['raw/inbox/example.md'],
      outgoing_links: [],
      status: 'active',
      updated_at: '2026-04-11T00:00:00.000Z'
    });
  });

  it('preserves explicit aliases and outgoing links', () => {
    const page = createKnowledgePage({
      path: 'wiki/entities/example.md',
      kind: 'entity',
      title: 'Example Entity',
      aliases: ['Example'],
      summary: 'Entity summary',
      tags: ['example', 'entity'],
      source_refs: ['raw/accepted/example.md'],
      outgoing_links: ['wiki/topics/llm-wiki.md'],
      status: 'archived',
      updated_at: '2026-04-11T01:00:00.000Z'
    });

    expect(page.aliases).toEqual(['Example']);
    expect(page.summary).toBe('Entity summary');
    expect(page.tags).toEqual(['example', 'entity']);
    expect(page.outgoing_links).toEqual(['wiki/topics/llm-wiki.md']);
    expect(page.kind).toBe('entity');
  });
});
