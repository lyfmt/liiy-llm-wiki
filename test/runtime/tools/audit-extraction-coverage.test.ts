import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createAuditExtractionCoverageTool } from '../../../src/runtime/tools/audit-extraction-coverage.js';

describe('createAuditExtractionCoverageTool', () => {
  it('fails when extraction coverage leaves sparse or missing blocks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-extraction-coverage-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'blocks.json'),
        `${JSON.stringify(
          {
            blocks: Array.from({ length: 6 }, (_, index) => ({
              blockId: `block-${String(index + 1).padStart(3, '0')}`,
              headingPath: ['Design Patterns'],
              locator: `h1:Design Patterns#p${index + 1}`,
              text: `Block ${index + 1}`
            }))
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged.json'),
        `${JSON.stringify(
          {
            entities: [],
            assertions: [],
            relations: [],
            evidenceAnchors: [
              { anchorId: 'anchor-001', blockId: 'block-001', quote: 'a' },
              { anchorId: 'anchor-002', blockId: 'block-001', quote: 'b' },
              { anchorId: 'anchor-003', blockId: 'block-002', quote: 'a' },
              { anchorId: 'anchor-004', blockId: 'block-002', quote: 'b' },
              { anchorId: 'anchor-005', blockId: 'block-003', quote: 'a' },
              { anchorId: 'anchor-006', blockId: 'block-003', quote: 'b' },
              { anchorId: 'anchor-007', blockId: 'block-004', quote: 'a' },
              { anchorId: 'anchor-008', blockId: 'block-004', quote: 'b' },
              { anchorId: 'anchor-009', blockId: 'block-005', quote: 'only one anchor' }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createAuditExtractionCoverageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-extraction-coverage-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        blocksArtifact: 'state/artifacts/knowledge-insert/run-001/blocks.json',
        mergedCandidatesArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-001/coverage.json'
      });
      const coverage = result.details.data?.coverage as
        | {
            completedBlocks: number;
            sparseBlockIds: string[];
            unreadBlockIds: string[];
          }
        | undefined;

      expect(result.details.summary).toBe('coverage audit failed');
      expect(coverage?.completedBlocks).toBe(4);
      expect(coverage?.sparseBlockIds).toEqual(['block-005']);
      expect(coverage?.unreadBlockIds).toEqual(['block-006']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed coverage artifacts instead of silently dropping invalid entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-extraction-coverage-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-001');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'blocks.json'),
        `${JSON.stringify(
          {
            blocks: [
              {
                blockId: 'block-001',
                headingPath: ['Design Patterns'],
                locator: 'h1:Design Patterns#p1',
                text: 'Block 1'
              },
              {
                blockId: 2
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged.json'),
        `${JSON.stringify(
          {
            evidenceAnchors: [{ anchorId: 'anchor-001', blockId: 'block-001', quote: 'a' }]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createAuditExtractionCoverageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-extraction-coverage-invalid-001'
        })
      );

      await expect(
        tool.execute('tool-call-invalid-1', {
          blocksArtifact: 'state/artifacts/knowledge-insert/run-001/blocks.json',
          mergedCandidatesArtifact: 'state/artifacts/knowledge-insert/run-001/merged.json',
          outputArtifact: 'state/artifacts/knowledge-insert/run-001/coverage.json'
        })
      ).rejects.toThrow('Invalid split resource blocks artifact');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores page marker blocks when computing unread coverage for uploaded PDFs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-audit-extraction-coverage-'));

    try {
      await bootstrapProject(root);
      const artifactDirectory = path.join(root, 'state', 'artifacts', 'knowledge-insert', 'run-002');
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        path.join(artifactDirectory, 'blocks.json'),
        `${JSON.stringify(
          {
            blocks: [
              {
                blockId: 'block-001',
                headingPath: ['Uploaded PDF'],
                locator: 'h1:Uploaded PDF#p1',
                text: '有效内容块',
                kind: 'paragraph'
              },
              {
                blockId: 'block-002',
                headingPath: ['Uploaded PDF'],
                locator: 'h1:Uploaded PDF#p2',
                text: '-- 2 of 358 --',
                kind: 'paragraph'
              }
            ]
          },
          null,
          2
        )}\n`,
        'utf8'
      );
      await writeFile(
        path.join(artifactDirectory, 'merged.json'),
        `${JSON.stringify(
          {
            evidenceAnchors: [{ anchorId: 'anchor-001', blockId: 'block-001', quote: '有效内容块' }]
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const tool = createAuditExtractionCoverageTool(
        createRuntimeContext({
          root,
          runId: 'runtime-audit-extraction-coverage-page-marker-001'
        })
      );

      const result = await tool.execute('tool-call-page-marker-1', {
        blocksArtifact: 'state/artifacts/knowledge-insert/run-002/blocks.json',
        mergedCandidatesArtifact: 'state/artifacts/knowledge-insert/run-002/merged.json',
        outputArtifact: 'state/artifacts/knowledge-insert/run-002/coverage.json',
        minimumEvidenceAnchorsPerBlock: 1
      });
      const coverage = result.details.data?.coverage as
        | {
            totalBlocks: number;
            completedBlocks: number;
            unreadBlockIds: string[];
          }
        | undefined;

      expect(result.details.summary).toBe('coverage audit passed');
      expect(coverage?.totalBlocks).toBe(1);
      expect(coverage?.completedBlocks).toBe(1);
      expect(coverage?.unreadBlockIds).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
