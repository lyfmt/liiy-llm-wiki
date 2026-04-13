import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createSourceManifest } from '../../../src/domain/source-manifest.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createIngestSourceTool } from '../../../src/runtime/tools/ingest-source.js';
import { loadRequestRunState } from '../../../src/storage/request-run-state-store.js';
import { saveSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('createIngestSourceTool', () => {
  it('runs ingest with a nested tool run id and reports persisted files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-ingest-tool-'));

    try {
      await bootstrapProject(root);
      await writeFile(
        path.join(root, 'raw', 'accepted', 'design.md'),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n',
        'utf8'
      );
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:design',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      const runtimeContext = createRuntimeContext({
        root,
        runId: 'runtime-parent-001'
      });
      const tool = createIngestSourceTool(runtimeContext);

      const result = await tool.execute('tool-call-1', {
        sourceId: 'src-001'
      });

      expect(result.details.touchedFiles).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      const nestedState = await loadRequestRunState(root, 'runtime-parent-001--ingest-1');
      expect(nestedState.request_run.intent).toBe('ingest');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
