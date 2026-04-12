import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readRawDocument } from '../../../src/flows/ingest/read-raw-document.js';

describe('readRawDocument', () => {
  it('reads markdown from raw/accepted and returns its body', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      const acceptedDir = path.join(root, 'raw', 'accepted');
      await mkdir(acceptedDir, { recursive: true });
      await writeFile(path.join(acceptedDir, 'design.md'), '# Design\n\nPatch first stays stable.\n', 'utf8');

      await expect(readRawDocument(root, 'raw/accepted/design.md')).resolves.toBe(
        '# Design\n\nPatch first stays stable.\n'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects paths outside raw/accepted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await expect(readRawDocument(root, 'wiki/topics/patch-first.md')).rejects.toThrow(
        'Invalid raw document path'
      );
      await expect(readRawDocument(root, 'raw/inbox/design.md')).rejects.toThrow('Invalid raw document path');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['raw/accepted/../design.md', 'raw/accepted/./design.md', 'raw/accepted\\design.md'])(
    'rejects traversal-like accepted path %s',
    async (rawPath) => {
      const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

      try {
        await expect(readRawDocument(root, rawPath)).rejects.toThrow('Invalid raw document path');
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it('wraps a missing accepted raw file with a stable error', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      await mkdir(path.join(root, 'raw', 'accepted'), { recursive: true });

      await expect(readRawDocument(root, 'raw/accepted/missing.md')).rejects.toThrow(
        'Missing raw document: raw/accepted/missing.md'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a symlink inside raw/accepted that resolves outside the accepted subtree', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-ingest-'));

    try {
      const acceptedDir = path.join(root, 'raw', 'accepted');
      const outsidePath = path.join(root, 'outside.md');
      await mkdir(acceptedDir, { recursive: true });
      await writeFile(outsidePath, 'outside\n', 'utf8');
      await symlink(outsidePath, path.join(acceptedDir, 'escape.md'));

      await expect(readRawDocument(root, 'raw/accepted/escape.md')).rejects.toThrow('Invalid raw document path');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return;
      }

      throw error;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
