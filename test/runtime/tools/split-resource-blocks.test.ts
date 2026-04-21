import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createSplitResourceBlocksTool } from '../../../src/runtime/tools/split-resource-blocks.js';

describe('createSplitResourceBlocksTool', () => {
  it('splits a prepared resource artifact into stable knowledge blocks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-split-resource-blocks-'));

    try {
      await bootstrapProject(root);
      const resourceArtifactPath = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'resource.json');
      const blocksArtifactPath = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001', 'blocks.json');
      await mkdir(path.dirname(resourceArtifactPath), { recursive: true });
      await writeFile(
        resourceArtifactPath,
        `${JSON.stringify(
          {
            manifestId: 'src-001',
            rawPath: 'raw/accepted/design.md',
            structuredMarkdown: [
              '# Design Patterns',
              '',
              'Patch-first systems keep durable notes.',
              '',
              'They prefer incremental edits over rewrites.',
              '',
              '## Review Gates',
              '',
              'High-impact changes require escalation.',
              '',
              '- Escalate destructive changes.',
              '- Keep evidence attached.',
              '',
              '## Tooling',
              '',
              'Worker subagents can read artifacts in batches.'
            ].join('\n'),
            sections: [],
            metadata: {
              preparedAt: '2026-04-21T00:00:00.000Z'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createSplitResourceBlocksTool(
        createRuntimeContext({
          root,
          runId: 'runtime-split-resource-blocks-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        resourceArtifact: 'state/artifacts/knowledge-insert/run-001/resource.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/blocks.json'
      });
      const parsed = JSON.parse(await readFile(blocksArtifactPath, 'utf8'));

      expect(result.details.summary).toBe('split resource into 6 knowledge blocks');
      expect(parsed.blocks[0]).toEqual(
        expect.objectContaining({
          blockId: 'block-001',
          headingPath: ['Design Patterns'],
          locator: expect.any(String)
        })
      );
      expect(parsed.blocks).toHaveLength(6);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
