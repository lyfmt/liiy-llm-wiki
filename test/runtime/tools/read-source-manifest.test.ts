import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createReadSourceManifestTool } from '../../../src/runtime/tools/read-source-manifest.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('createReadSourceManifestTool', () => {
  it('reads a source manifest with metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-source-manifest-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-13T00:00:00.000Z',
          tags: ['patch-first'],
          notes: 'primary design source'
        })
      );
      const tool = createReadSourceManifestTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-source-manifest-001'
        })
      );

      const result = await tool.execute('tool-call-1', { sourceId: 'src-001' });

      expect(result.details.summary).toBe('read source manifest src-001');
      expect(result.details.evidence).toEqual(['raw/accepted/design.md']);
      expect(result.details.resultMarkdown).toContain('Status: accepted');
      expect(result.details.resultMarkdown).toContain('primary design source');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
