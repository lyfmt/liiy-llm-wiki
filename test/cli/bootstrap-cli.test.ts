import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { logDirectExecError, main } from '../../src/cli.js';

describe('main', () => {
  it('bootstraps the project scaffold from argv', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await main(['node', 'cli.js', root]);

      await expect(readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).resolves.toContain('# Wiki Index');
      expect(logSpy).toHaveBeenNthCalledWith(
        1,
        JSON.stringify(
          {
            root,
            directories: 20,
            files: 8
          },
          null,
          2
        )
      );

      await main(['node', 'cli.js', root]);

      expect(logSpy).toHaveBeenNthCalledWith(
        2,
        JSON.stringify(
          {
            root,
            directories: 20,
            files: 0
          },
          null,
          2
        )
      );
    } finally {
      logSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast when the target root is missing', async () => {
    await expect(main(['node', 'cli.js'])).rejects.toThrow(
      'Usage: node dist/cli.js <project-root> | bootstrap <project-root> | run <project-root> <request> | serve <project-root> [port]'
    );
  });
});

describe('logDirectExecError', () => {
  it('prints only the error message for usage failures', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      logDirectExecError(
        new Error('Usage: node dist/cli.js <project-root> | bootstrap <project-root> | run <project-root> <request> | serve <project-root> [port]')
      );

      expect(errorSpy).toHaveBeenCalledWith(
        'Usage: node dist/cli.js <project-root> | bootstrap <project-root> | run <project-root> <request> | serve <project-root> [port]'
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
