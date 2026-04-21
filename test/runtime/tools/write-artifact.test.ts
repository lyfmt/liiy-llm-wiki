import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildProjectPaths } from '../../../src/config/project-paths.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createWriteArtifactTool } from '../../../src/runtime/tools/write-artifact.js';

describe('createWriteArtifactTool', () => {
  it('writes an artifact under state/artifacts and creates parent directories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-write-artifact-'));

    try {
      const artifactPath = 'subagents/run-001--subagent-1/receipt.json';
      const expectedPath = path.join(buildProjectPaths(root).stateArtifacts, artifactPath);
      const tool = createWriteArtifactTool(
        createRuntimeContext({
          root,
          runId: 'runtime-write-artifact-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        artifactPath,
        content: '{\n  "status": "done"\n}\n'
      });

      expect(result.details.summary).toBe('wrote artifact subagents/run-001--subagent-1/receipt.json');
      expect(result.details.evidence).toEqual([expectedPath]);
      expect(result.details.touchedFiles).toEqual([path.join('state', 'artifacts', artifactPath)]);
      expect(await readFile(expectedPath, 'utf8')).toContain('"status": "done"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects overwriting an existing artifact unless overwrite is true', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-write-artifact-'));

    try {
      const artifactPath = 'subagents/run-001--subagent-1/receipt.json';
      const tool = createWriteArtifactTool(
        createRuntimeContext({
          root,
          runId: 'runtime-write-artifact-002'
        })
      );

      await tool.execute('tool-call-1', {
        artifactPath,
        content: 'first\n'
      });

      await expect(
        tool.execute('tool-call-2', {
          artifactPath,
          content: 'second\n'
        })
      ).rejects.toThrow(`Artifact already exists: ${artifactPath}`);

      const overwritten = await tool.execute('tool-call-3', {
        artifactPath,
        content: 'second\n',
        overwrite: true
      });

      expect(overwritten.details.summary).toBe(`wrote artifact ${artifactPath}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
