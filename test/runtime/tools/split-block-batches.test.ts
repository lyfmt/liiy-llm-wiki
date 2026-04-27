import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createSplitBlockBatchesTool } from '../../../src/runtime/tools/split-block-batches.js';

describe('createSplitBlockBatchesTool', () => {
  it('splits a blocks artifact into multiple worker batch input artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-split-block-batches-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'blocks.json'),
        `${JSON.stringify(
          {
            manifestId: 'src-001',
            rawPath: 'raw/accepted/design.md',
            blocks: Array.from({ length: 5 }, (_, index) => ({
              blockId: `block-${String(index + 1).padStart(3, '0')}`,
              headingPath: ['Design Patterns'],
              locator: `h1:Design Patterns#p${index + 1}`,
              text: `Block ${index + 1}`,
              kind: 'paragraph'
            }))
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createSplitBlockBatchesTool(
        createRuntimeContext({
          root,
          runId: 'runtime-split-block-batches-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        blocksArtifact: 'state/artifacts/knowledge-insert/run-001/blocks.json',
        batchSize: 2,
        batchRunIdPrefix: 'run-src-001--worker-batch-',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/block-batches.json'
      });
      const plan = JSON.parse(await readFile(path.join(artifactDirectory, 'block-batches.json'), 'utf8'));
      const firstBatch = JSON.parse(
        await readFile(
          path.join(root, 'state', 'artifacts', 'subagents', 'run-src-001--worker-batch-01', 'input', 'blocks.json'),
          'utf8'
        )
      );

      expect(result.details.summary).toBe('split 5 source blocks into 3 worker batches');
      expect(plan.batches).toHaveLength(3);
      expect(plan.batches[0]).toEqual(
        expect.objectContaining({
          batchId: '01',
          runId: 'run-src-001--worker-batch-01',
          inputArtifact: 'state/artifacts/subagents/run-src-001--worker-batch-01/input/blocks.json',
          outputDir: 'state/artifacts/subagents/run-src-001--worker-batch-01'
        })
      );
      expect(firstBatch.blocks).toHaveLength(2);
      expect(firstBatch.blocks[0]).toEqual(expect.objectContaining({ blockId: 'block-001' }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
