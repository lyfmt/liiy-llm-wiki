import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createListSourceManifestsTool } from '../../../src/runtime/tools/list-source-manifests.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('createListSourceManifestsTool', () => {
  it('lists source manifests filtered by status', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-list-source-manifests-'));

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
          tags: ['patch-first']
        })
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-002',
          path: 'raw/inbox/notes.md',
          title: 'Inbox Notes',
          type: 'markdown',
          status: 'inbox',
          hash: 'sha256:notes',
          imported_at: '2026-04-13T00:00:00.000Z'
        })
      );
      const tool = createListSourceManifestsTool(
        createRuntimeContext({
          root,
          runId: 'runtime-list-manifests-001'
        })
      );

      const result = await tool.execute('tool-call-1', { status: 'accepted' });

      expect(result.details.summary).toBe('listed 1 source manifest(s)');
      expect(result.details.evidence).toEqual(['raw/accepted/design.md']);
      expect(result.details.resultMarkdown).toContain('src-001');
      expect(result.details.resultMarkdown).not.toContain('src-002');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
