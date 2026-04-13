import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli.js';

describe('main run command', () => {
  it('keeps bootstrap compatibility through an explicit subcommand', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-run-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await main(['node', 'cli.js', 'bootstrap', root]);

      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify(
          {
            root,
            directories: 18,
            files: 6
          },
          null,
          2
        )
      );
      await expect(readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).resolves.toContain('# Wiki Index');
    } finally {
      logSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails fast when the run command is missing a request', async () => {
    await expect(main(['node', 'cli.js', 'run', '/tmp/project'])).rejects.toThrow(
      'Usage: node dist/cli.js run <project-root> <request>'
    );
  });

  it('preserves the legacy direct bootstrap form', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-run-legacy-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await main(['node', 'cli.js', root]);

      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify(
          {
            root,
            directories: 18,
            files: 6
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
});
