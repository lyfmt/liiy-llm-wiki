import { describe, expect, it } from 'vitest';

import { buildKnowledgePagePath } from '../../src/storage/knowledge-page-paths.js';

describe('buildKnowledgePagePath', () => {
  it.each([
    ['source', 'origin-story', '/tmp/llm-wiki-liiy/wiki/sources/origin-story.md'],
    ['entity', 'anthropic', '/tmp/llm-wiki-liiy/wiki/entities/anthropic.md'],
    ['taxonomy', 'engineering', '/tmp/llm-wiki-liiy/wiki/taxonomy/engineering.md'],
    ['topic', 'llm-wiki', '/tmp/llm-wiki-liiy/wiki/topics/llm-wiki.md'],
    ['query', 'what-is-patch-first', '/tmp/llm-wiki-liiy/wiki/queries/what-is-patch-first.md']
  ] as const)('maps %s pages into the correct wiki directory', (kind, slug, expectedPath) => {
    expect(buildKnowledgePagePath('/tmp/llm-wiki-liiy', kind, slug)).toBe(expectedPath);
  });

  it.each(['', '../other', 'nested/run-001', 'nested\\run-001', '.', '..'])(
    'rejects an unsafe page slug: %s',
    (slug) => {
      expect(() => buildKnowledgePagePath('/tmp/llm-wiki-liiy', 'topic', slug)).toThrow(
        `Invalid page slug: ${slug}`
      );
    }
  );
});
