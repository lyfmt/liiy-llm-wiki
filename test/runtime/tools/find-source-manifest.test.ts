import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createFindSourceManifestTool } from '../../../src/runtime/tools/find-source-manifest.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('createFindSourceManifestTool', () => {
  it('returns a selected candidate when there is a unique strongest accepted match', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-find-source-'));

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
          imported_at: '2026-04-12T00:00:00.000Z',
          tags: ['patch-first']
        })
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-002',
          path: 'raw/accepted/other.md',
          title: 'Other Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:other',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      const tool = createFindSourceManifestTool(
        createRuntimeContext({
          root,
          runId: 'runtime-find-001'
        })
      );

      const result = await tool.execute('tool-call-1', { query: 'patch first design' });

      expect(result.details.summary).toBe('selected src-001');
      expect(result.details.touchedFiles).toEqual([]);
      expect(result.details.resultMarkdown).toContain('Selected candidate: src-001');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns ambiguous candidates without selecting one when top matches tie', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-find-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/patch-first-a.md',
          title: 'Patch First',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:a',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-002',
          path: 'raw/accepted/patch-first-b.md',
          title: 'Patch First',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:b',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      const tool = createFindSourceManifestTool(
        createRuntimeContext({
          root,
          runId: 'runtime-find-002'
        })
      );

      const result = await tool.execute('tool-call-2', { query: 'patch first' });

      expect(result.details.summary).toBe('found 2 accepted source manifest candidates');
      expect(result.details.resultMarkdown).toContain('Ambiguous candidates');
      expect(result.details.resultMarkdown).toContain('src-001');
      expect(result.details.resultMarkdown).toContain('src-002');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns no matches without touching files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-find-source-'));

    try {
      const tool = createFindSourceManifestTool(
        createRuntimeContext({
          root,
          runId: 'runtime-find-003'
        })
      );

      const result = await tool.execute('tool-call-3', { query: 'missing source' });

      expect(result.details.summary).toBe('no accepted source manifests matched');
      expect(result.details.touchedFiles).toEqual([]);
      expect(result.details.resultMarkdown).toContain('No candidates');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
