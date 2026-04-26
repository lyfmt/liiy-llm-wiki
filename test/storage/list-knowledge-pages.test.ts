import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { listKnowledgePages } from '../../src/storage/list-knowledge-pages.js';

describe('listKnowledgePages', () => {
  it('lists persisted page slugs within a supported wiki kind directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-list-'));

    try {
      const topicsDir = path.join(root, 'wiki', 'topics');
      await mkdir(topicsDir, { recursive: true });
      await writeFile(path.join(topicsDir, 'llm-wiki.md'), '---\nkind: "topic"\n---\n# LLM Wiki\n', 'utf8');
      await writeFile(path.join(topicsDir, 'patch-first.md'), '---\nkind: "topic"\n---\n# Patch First\n', 'utf8');
      await writeFile(path.join(topicsDir, 'ignore.txt'), 'nope', 'utf8');

      expect(await listKnowledgePages(root, 'topic')).toEqual(['llm-wiki', 'patch-first']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns an empty list when the wiki kind directory does not exist yet', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-list-'));

    try {
      expect(await listKnowledgePages(root, 'query')).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lists taxonomy page slugs from wiki/taxonomy', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-list-'));

    try {
      const taxonomyDir = path.join(root, 'wiki', 'taxonomy');
      await mkdir(taxonomyDir, { recursive: true });
      await writeFile(path.join(taxonomyDir, 'engineering.md'), '---\nkind: "taxonomy"\n---\n# Engineering\n', 'utf8');
      await writeFile(path.join(taxonomyDir, 'platform.md'), '---\nkind: "taxonomy"\n---\n# Platform\n', 'utf8');

      expect(await listKnowledgePages(root, 'taxonomy')).toEqual(['engineering', 'platform']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
