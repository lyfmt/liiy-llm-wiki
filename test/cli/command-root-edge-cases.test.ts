import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli.js';

describe('main command/root edge cases', () => {
  it('supports legacy bootstrap when the project root basename is run', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-edge-'));
    const root = path.join(parent, 'run');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await main(['node', 'cli.js', root]);

      expect(logSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { root: string };
      expect(output.root).toBe(root);
    } finally {
      logSpy.mockRestore();
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('supports legacy bootstrap when the project root basename is bootstrap', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'llm-wiki-cli-edge-'));
    const root = path.join(parent, 'bootstrap');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await main(['node', 'cli.js', root]);

      expect(logSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { root: string };
      expect(output.root).toBe(root);
    } finally {
      logSpy.mockRestore();
      await rm(parent, { recursive: true, force: true });
    }
  });
});
