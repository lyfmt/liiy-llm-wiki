import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgePage } from '../../src/domain/knowledge-page.js';
import {
  loadKnowledgePage,
  saveKnowledgePage
} from '../../src/storage/knowledge-page-store.js';

describe('saveKnowledgePage', () => {
  it('writes a topic page as markdown with YAML frontmatter and body content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      const page = createKnowledgePage({
        path: 'wiki/topics/llm-wiki.md',
        kind: 'topic',
        title: 'LLM: "Wiki"',
        aliases: ['Local Wiki Agent', 'Line 1\nLine 2'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: ['wiki/entities/anthropic.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      });

      const filePath = await saveKnowledgePage(root, page, '# LLM Wiki\n\nPatch-first updates.\n');
      const markdown = await readFile(filePath, 'utf8');

      expect(filePath).toBe(path.join(root, 'wiki', 'topics', 'llm-wiki.md'));
      expect(markdown).toContain('---\nkind: "topic"\ntitle: "LLM: \\"Wiki\\""');
      expect(markdown).toContain('aliases:\n  - "Local Wiki Agent"');
      expect(markdown).toContain('  - "Line 1\\nLine 2"');
      expect(markdown).toContain('source_refs:\n  - "raw/accepted/design.md"');
      expect(markdown).toContain('outgoing_links:\n  - "wiki/entities/anthropic.md"');
      expect(markdown).toContain('status: "active"');
      expect(markdown).toContain('updated_at: "2026-04-12T00:00:00.000Z"');
      expect(markdown).toContain('\n---\n# LLM Wiki\n\nPatch-first updates.\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('overwrites an existing page file when saving the same page again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      const page = createKnowledgePage({
        path: 'wiki/topics/llm-wiki.md',
        kind: 'topic',
        title: 'LLM Wiki',
        source_refs: ['raw/accepted/design.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      });

      const filePath = await saveKnowledgePage(root, page, '# First\n');
      await saveKnowledgePage(root, page, '# Second\n');

      expect(await readFile(filePath, 'utf8')).toContain('\n---\n# Second\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a page whose path does not match its kind directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      const page = createKnowledgePage({
        path: 'wiki/entities/anthropic.md',
        kind: 'topic',
        title: 'Anthropic',
        source_refs: ['raw/accepted/design.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      });

      await expect(saveKnowledgePage(root, page, '# Anthropic\n')).rejects.toThrow(
        'Invalid knowledge page: path does not match kind directory'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('knowledge page storage', () => {
  it.each([
    {
      kind: 'source',
      slug: 'design-spec',
      page: createKnowledgePage({
        path: 'wiki/sources/design-spec.md',
        kind: 'source',
        title: 'Design Spec',
        aliases: ['Spec'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: ['wiki/topics/llm-wiki.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      }),
      body: '# Design Spec\n\nPrimary source summary.\n'
    },
    {
      kind: 'entity',
      slug: 'anthropic',
      page: createKnowledgePage({
        path: 'wiki/entities/anthropic.md',
        kind: 'entity',
        title: 'Anthropic',
        aliases: ['Anthropic PBC'],
        source_refs: ['raw/accepted/design.md'],
        outgoing_links: ['wiki/topics/llm-wiki.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      }),
      body: '# Anthropic\n\nEntity page.\n'
    },
    {
      kind: 'query',
      slug: 'what-is-patch-first',
      page: createKnowledgePage({
        path: 'wiki/queries/what-is-patch-first.md',
        kind: 'query',
        title: 'What Is Patch First?',
        source_refs: ['wiki/topics/llm-wiki.md'],
        outgoing_links: ['wiki/topics/llm-wiki.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      }),
      body: '# What Is Patch First?\n\nReusable answer.\n'
    }
  ] as const)('loads a saved $kind page back into a knowledge page and body', async ({ kind, slug, page, body }) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      await saveKnowledgePage(root, page, body);

      const loaded = await loadKnowledgePage(root, kind, slug);

      expect(loaded).toEqual({
        page,
        body
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a mismatched persisted kind for the requested location', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/llm-wiki.md',
          kind: 'topic',
          title: 'LLM Wiki',
          source_refs: ['raw/accepted/design.md'],
          status: 'active',
          updated_at: '2026-04-12T00:00:00.000Z'
        }),
        '# LLM Wiki\n'
      );

      const filePath = path.join(root, 'wiki', 'topics', 'llm-wiki.md');
      const markdown = await readFile(filePath, 'utf8');
      await writeFile(filePath, markdown.replace('kind: "topic"', 'kind: "entity"'), 'utf8');

      await expect(loadKnowledgePage(root, 'topic', 'llm-wiki')).rejects.toThrow(
        'Invalid knowledge page: kind does not match requested location'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a markdown file without valid frontmatter fences', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      const page = createKnowledgePage({
        path: 'wiki/topics/llm-wiki.md',
        kind: 'topic',
        title: 'LLM Wiki',
        source_refs: ['raw/accepted/design.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      });
      const filePath = await saveKnowledgePage(root, page, '# LLM Wiki\n');
      await writeFile(filePath, 'kind: topic\ntitle: Missing fences\nstatus: active\nupdated_at: 2026-04-12T00:00:00.000Z\n');

      await expect(loadKnowledgePage(root, 'topic', 'llm-wiki')).rejects.toThrow(
        'Invalid knowledge page: malformed frontmatter'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects frontmatter with malformed list indentation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-page-'));

    try {
      const page = createKnowledgePage({
        path: 'wiki/topics/llm-wiki.md',
        kind: 'topic',
        title: 'LLM Wiki',
        aliases: ['Local Wiki Agent'],
        source_refs: ['raw/accepted/design.md'],
        status: 'active',
        updated_at: '2026-04-12T00:00:00.000Z'
      });
      const filePath = await saveKnowledgePage(root, page, '# LLM Wiki\n');
      const markdown = await readFile(filePath, 'utf8');
      await writeFile(filePath, markdown.replace('  - "Local Wiki Agent"', '  - ['), 'utf8');

      await expect(loadKnowledgePage(root, 'topic', 'llm-wiki')).rejects.toThrow(
        'Invalid knowledge page: malformed frontmatter'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
