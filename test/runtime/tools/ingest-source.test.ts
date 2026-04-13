import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('resolves sourcePath to an accepted manifest and ingests it', async () => {
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
        runId: 'runtime-parent-002'
      });
      const tool = createIngestSourceTool(runtimeContext);

      const result = await tool.execute('tool-call-2', {
        sourcePath: 'raw/accepted/design.md'
      });

      expect(result.details.resultMarkdown).toContain('Resolved raw/accepted/design.md to src-001.');
      expect(result.details.touchedFiles).toEqual([
        'wiki/sources/src-001.md',
        'wiki/topics/patch-first-design.md',
        'wiki/index.md',
        'wiki/log.md'
      ]);
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain('src-001');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects when both sourceId and sourcePath are provided', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-ingest-tool-'));

    try {
      const tool = createIngestSourceTool(
        createRuntimeContext({
          root,
          runId: 'runtime-parent-003'
        })
      );

      await expect(
        tool.execute('tool-call-3', {
          sourceId: 'src-001',
          sourcePath: 'raw/accepted/design.md'
        })
      ).rejects.toThrow('Invalid ingest source locator: provide exactly one of sourceId or sourcePath');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects when neither sourceId nor sourcePath is provided', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-ingest-tool-'));

    try {
      const tool = createIngestSourceTool(
        createRuntimeContext({
          root,
          runId: 'runtime-parent-004'
        })
      );

      await expect(tool.execute('tool-call-4', {})).rejects.toThrow(
        'Invalid ingest source locator: provide exactly one of sourceId or sourcePath'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('surfaces a clear error when sourcePath has no accepted manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-ingest-tool-'));

    try {
      await bootstrapProject(root);
      const tool = createIngestSourceTool(
        createRuntimeContext({
          root,
          runId: 'runtime-parent-005'
        })
      );

      await expect(
        tool.execute('tool-call-5', {
          sourcePath: 'raw/accepted/missing.md'
        })
      ).rejects.toThrow('No accepted source manifest found for path: raw/accepted/missing.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed when sourcePath resolves to multiple accepted manifests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-ingest-tool-'));

    try {
      await bootstrapProject(root);
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/accepted/design.md',
          title: 'Patch First Design A',
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
          path: 'raw/accepted/design.md',
          title: 'Patch First Design B',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:b',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      const tool = createIngestSourceTool(
        createRuntimeContext({
          root,
          runId: 'runtime-parent-006'
        })
      );

      await expect(
        tool.execute('tool-call-6', {
          sourcePath: 'raw/accepted/design.md'
        })
      ).rejects.toThrow('Ambiguous accepted source manifest for path raw/accepted/design.md: src-001, src-002');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
