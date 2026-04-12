import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createSourceManifest } from '../../src/domain/source-manifest.js';
import { buildSourceManifestPath } from '../../src/storage/source-manifest-paths.js';
import {
  loadSourceManifest,
  saveSourceManifest
} from '../../src/storage/source-manifest-store.js';

describe('saveSourceManifest', () => {
  it('writes a source manifest JSON record under state/artifacts/source-manifests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      const manifest = createSourceManifest({
        id: 'src-001',
        path: 'raw/inbox/design.md',
        title: 'Design Spec',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:abc123',
        imported_at: '2026-04-12T00:00:00.000Z',
        tags: ['design', 'wiki'],
        notes: 'accepted for synthesis'
      });

      const filePath = await saveSourceManifest(root, manifest);
      expect(filePath).toBe(path.join(root, 'state', 'artifacts', 'source-manifests', 'src-001.json'));
      expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
        id: 'src-001',
        path: 'raw/inbox/design.md',
        title: 'Design Spec',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:abc123',
        imported_at: '2026-04-12T00:00:00.000Z',
        tags: ['design', 'wiki'],
        notes: 'accepted for synthesis'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('overwrites an existing source manifest record when saving the same id again', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Draft Title',
          type: 'markdown',
          hash: 'sha256:abc123',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );

      const filePath = await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Final Title',
          type: 'markdown',
          status: 'processed',
          hash: 'sha256:def456',
          imported_at: '2026-04-12T00:00:00.000Z',
          notes: 'finalized'
        })
      );

      expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
        title: 'Final Title',
        status: 'processed',
        hash: 'sha256:def456',
        notes: 'finalized'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    'wiki/topics/not-raw.md',
    'raw/../wiki/topic.md',
    'raw/subdir/../../schema/rules.json',
    './raw/inbox/design.md',
    'schema/../raw/inbox/design.md',
    'raw/inbox/../design.md',
    'raw\\..\\wiki\\topic.md',
    'raw/inbox\\..\\..\\wiki/topic.md'
  ])('rejects saving a manifest path outside the raw layer: %s', async (manifestPath) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      const manifest = createSourceManifest({
        id: 'src-001',
        path: manifestPath,
        title: 'Bad Manifest',
        type: 'markdown',
        hash: 'sha256:abc123',
        imported_at: '2026-04-12T00:00:00.000Z'
      });

      await expect(saveSourceManifest(root, manifest)).rejects.toThrow(
        'Invalid source manifest: invalid src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('source manifest storage', () => {
  it('loads a saved source manifest back into the domain shape', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Design Spec',
          type: 'markdown',
          status: 'accepted',
          hash: 'sha256:abc123',
          imported_at: '2026-04-12T00:00:00.000Z',
          tags: ['design', 'wiki'],
          notes: 'accepted for synthesis'
        })
      );

      expect(await loadSourceManifest(root, 'src-001')).toEqual({
        id: 'src-001',
        path: 'raw/inbox/design.md',
        title: 'Design Spec',
        type: 'markdown',
        status: 'accepted',
        hash: 'sha256:abc123',
        imported_at: '2026-04-12T00:00:00.000Z',
        tags: ['design', 'wiki'],
        notes: 'accepted for synthesis'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a missing manifest record', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await expect(loadSourceManifest(root, 'src-001')).rejects.toThrow(
        'Incomplete source manifest state: missing src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a malformed manifest record', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Design Spec',
          type: 'markdown',
          hash: 'sha256:abc123',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      const filePath = buildSourceManifestPath(root, 'src-001');
      await writeFile(filePath, '{', 'utf8');

      await expect(loadSourceManifest(root, 'src-001')).rejects.toThrow(
        'Invalid source manifest: malformed src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an invalid manifest shape', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Design Spec',
          type: 'markdown',
          hash: 'sha256:abc123',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      const filePath = buildSourceManifestPath(root, 'src-001');
      await writeFile(filePath, '{\n  "title": "Missing id"\n}\n', 'utf8');

      await expect(loadSourceManifest(root, 'src-001')).rejects.toThrow(
        'Invalid source manifest: invalid src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    'wiki/topics/not-raw.md',
    'raw/../wiki/topic.md',
    'raw/subdir/../../schema/rules.json',
    './raw/inbox/design.md',
    'schema/../raw/inbox/design.md',
    'raw/inbox/../design.md',
    'raw\\..\\wiki\\topic.md',
    'raw/inbox\\..\\..\\wiki/topic.md'
  ])('rejects a manifest path outside the raw layer on load: %s', async (manifestPath) => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-source-'));

    try {
      await saveSourceManifest(
        root,
        createSourceManifest({
          id: 'src-001',
          path: 'raw/inbox/design.md',
          title: 'Design Spec',
          type: 'markdown',
          hash: 'sha256:abc123',
          imported_at: '2026-04-12T00:00:00.000Z'
        })
      );
      const filePath = buildSourceManifestPath(root, 'src-001');
      const serializedPath = manifestPath.includes('\\')
        ? JSON.stringify(manifestPath).slice(1, -1)
        : manifestPath;
      await writeFile(
        filePath,
        `{
  "id": "src-001",
  "path": "${serializedPath}",
  "title": "Design Spec",
  "type": "markdown",
  "status": "inbox",
  "hash": "sha256:abc123",
  "imported_at": "2026-04-12T00:00:00.000Z",
  "tags": [],
  "notes": ""
}
`,
        'utf8'
      );

      await expect(loadSourceManifest(root, 'src-001')).rejects.toThrow(
        'Invalid source manifest: invalid src-001.json'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
