import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createKnowledgePage } from '../../../../src/domain/knowledge-page.js';
import { saveKnowledgePage } from '../../../../src/storage/knowledge-page-store.js';

vi.mock('../../../../src/storage/knowledge-page-store.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/storage/knowledge-page-store.js')>(
    '../../../../src/storage/knowledge-page-store.js'
  );

  return {
    ...actual,
    loadKnowledgePage: vi.fn(actual.loadKnowledgePage),
    loadKnowledgePageMetadata: vi.fn(actual.loadKnowledgePageMetadata)
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('buildKnowledgePageResponseDto', () => {
  it('loads the requested page body once and uses metadata reads for related pages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-18T00:00:00.000Z'
        }),
        '# Patch First\n\n'.padEnd(32_768, 'p')
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-18T00:10:00.000Z'
        }),
        '# Patch First Question\n\n'.padEnd(16_384, 'q')
      );

      const storage = await import('../../../../src/storage/knowledge-page-store.js');
      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      const response = await buildKnowledgePageResponseDto(root, 'topic', 'patch-first');

      expect(response.page.title).toBe('Patch First');
      expect(response.page.body.startsWith('# Patch First')).toBe(true);
      expect(response.navigation.related_by_source[0]?.title).toBe('Patch First Question');
      expect(vi.mocked(storage.loadKnowledgePage)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(storage.loadKnowledgePage)).toHaveBeenCalledWith(root, 'topic', 'patch-first');
      expect(vi.mocked(storage.loadKnowledgePageMetadata)).toHaveBeenCalledWith(root, 'query', 'patch-first-question');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
