import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createReadRawSourceTool } from '../../../src/runtime/tools/read-raw-source.js';

describe('createReadRawSourceTool', () => {
  it('reads an accepted raw source document', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-raw-source-'));

    try {
      const acceptedDirectory = path.join(root, 'raw', 'accepted');
      await mkdir(acceptedDirectory, { recursive: true });
      await writeFile(path.join(acceptedDirectory, 'design.md'), '# Patch First\n\nPatch-first updates keep page structure stable.\n', 'utf8');
      const tool = createReadRawSourceTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-raw-001'
        })
      );

      const result = await tool.execute('tool-call-1', { rawPath: 'raw/accepted/design.md' });

      expect(result.details.summary).toBe('read raw/accepted/design.md');
      expect(result.details.evidence).toEqual(['raw/accepted/design.md']);
      expect(result.details.resultMarkdown).toContain('Patch-first updates keep page structure stable.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
