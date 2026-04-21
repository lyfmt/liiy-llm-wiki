import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { discoverRuntimeSubagents } from '../../../src/runtime/subagents/discovery.js';

describe('discoverRuntimeSubagents', () => {
  it('loads worker and reviewer profiles from .agents/subagents', async () => {
    const root = process.cwd();
    const result = await discoverRuntimeSubagents(root);

    expect(result.profiles.map((profile) => profile.name)).toEqual(['reviewer', 'worker']);
    expect(result.profiles[0]?.filePath).toBe(path.join(root, '.agents', 'subagents', 'reviewer', 'SUBAGENT.md'));
    expect(result.profiles[0]?.maxTools).toContain('read_artifact');
    expect(result.diagnostics).toEqual([]);
  });
});
