import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildProjectPaths } from '../../../src/config/project-paths.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createReadArtifactTool } from '../../../src/runtime/tools/read-artifact.js';

describe('createReadArtifactTool', () => {
  it('reads an artifact from state/artifacts and returns absolute evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-artifact-'));

    try {
      const artifactPath = 'subagents/run-001--subagent-1/receipt.json';
      const absolutePath = path.join(buildProjectPaths(root).stateArtifacts, artifactPath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, '{\n  "status": "done"\n}\n', 'utf8');

      const tool = createReadArtifactTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-artifact-001'
        })
      );

      const result = await tool.execute('tool-call-1', { artifactPath });

      expect(result.details.summary).toBe(`read artifact ${artifactPath}`);
      expect(result.details.evidence).toEqual([absolutePath]);
      expect(result.details.resultMarkdown).toBe('{\n  "status": "done"\n}\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
