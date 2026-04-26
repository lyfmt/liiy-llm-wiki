import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildKnowledgeInsertPipelineArtifactPath,
  writeKnowledgeInsertPipelineArtifact
} from '../../../src/flows/knowledge-insert/pipeline-artifacts.js';

describe('knowledge insert pipeline artifacts', () => {
  it('writes artifacts under the pipeline run directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-pipeline-artifacts-'));

    try {
      const artifact = await writeKnowledgeInsertPipelineArtifact(root, 'run-001', 'topic-plan.json', { ok: true });

      expect(artifact.projectPath).toBe('state/artifacts/knowledge-insert-pipeline/run-001/topic-plan.json');
      expect(JSON.parse(await readFile(artifact.absolutePath, 'utf8'))).toEqual({ ok: true });
      expect(buildKnowledgeInsertPipelineArtifactPath(root, 'run-001', 'parts/part-001.json').projectPath)
        .toBe('state/artifacts/knowledge-insert-pipeline/run-001/parts/part-001.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
