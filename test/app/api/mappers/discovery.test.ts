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

describe('buildDiscoveryResponseDto', () => {
  it('uses metadata-only reads for discovery listings', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-discovery-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/sources/source-a.md',
          kind: 'source',
          title: 'Source A',
          summary: 'Short source summary.',
          source_refs: ['raw/accepted/source-a.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-18T00:00:00.000Z'
        }),
        '# Source A\n\n'.padEnd(32_768, 'a')
      );

      const storage = await import('../../../../src/storage/knowledge-page-store.js');
      const { buildDiscoveryResponseDto } = await import('../../../../src/app/api/mappers/discovery.js');
      const response = await buildDiscoveryResponseDto(root);

      expect(response.totals.sources).toBe(1);
      expect(response.sections.find((section) => section.kind === 'source')?.items[0]?.summary).toBe('Short source summary.');
      expect(vi.mocked(storage.loadKnowledgePage)).not.toHaveBeenCalled();
      expect(vi.mocked(storage.loadKnowledgePageMetadata)).toHaveBeenCalledWith(root, 'source', 'source-a');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
