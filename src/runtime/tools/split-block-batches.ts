import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { KnowledgeResourceBlock } from './split-resource-blocks.js';

const parameters = Type.Object({
  blocksArtifact: Type.String({ description: 'Source blocks artifact under state/artifacts/.' }),
  batchSize: Type.Number({ description: 'Maximum number of source blocks per worker batch.', minimum: 1, maximum: 200 }),
  batchRunIdPrefix: Type.String({ description: 'Prefix for worker batch run ids, for example run-src-001--worker-batch-.' }),
  outputArtifact: Type.String({ description: 'Artifact path for the batch plan JSON.' })
});

export type SplitBlockBatchesParameters = Static<typeof parameters>;

export interface SplitBlockBatchPlanEntry {
  batchId: string;
  runId: string;
  blockCount: number;
  inputArtifact: string;
  outputDir: string;
  firstBlockId: string;
  lastBlockId: string;
}

export interface SplitBlockBatchesArtifact {
  manifestId: string;
  rawPath: string;
  totalBlocks: number;
  batchSize: number;
  batches: SplitBlockBatchPlanEntry[];
}

interface SplitResourceBlocksArtifactShape {
  manifestId: string;
  rawPath: string;
  blocks: KnowledgeResourceBlock[];
}

export function createSplitBlockBatchesTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'split_block_batches',
    label: 'Split Block Batches',
    description:
      'Split a large source-block artifact into multiple worker batch input artifacts under state/artifacts/subagents/.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedInput = resolveStateArtifactPath(runtimeContext.root, params.blocksArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const artifact = parseBlocksArtifact(await readFile(resolvedInput.absolutePath, 'utf8'));
      const batches = chunkBlocks(artifact.blocks, params.batchSize);
      const planEntries: SplitBlockBatchPlanEntry[] = [];

      for (const [index, batchBlocks] of batches.entries()) {
        const batchId = String(index + 1).padStart(2, '0');
        const runId = `${params.batchRunIdPrefix}${batchId}`;
        const inputArtifact = `state/artifacts/subagents/${runId}/input/blocks.json`;
        const outputDir = `state/artifacts/subagents/${runId}`;
        const resolvedBatchInput = resolveStateArtifactPath(runtimeContext.root, inputArtifact);
        await mkdir(path.dirname(resolvedBatchInput.absolutePath), { recursive: true });
        await writeFile(
          resolvedBatchInput.absolutePath,
          `${JSON.stringify(
            {
              manifestId: artifact.manifestId,
              rawPath: artifact.rawPath,
              blocks: batchBlocks
            },
            null,
            2
          )}\n`,
          'utf8'
        );

        planEntries.push({
          batchId,
          runId,
          blockCount: batchBlocks.length,
          inputArtifact,
          outputDir,
          firstBlockId: batchBlocks[0]!.blockId,
          lastBlockId: batchBlocks[batchBlocks.length - 1]!.blockId
        });
      }

      const batchPlan: SplitBlockBatchesArtifact = {
        manifestId: artifact.manifestId,
        rawPath: artifact.rawPath,
        totalBlocks: artifact.blocks.length,
        batchSize: params.batchSize,
        batches: planEntries
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(batchPlan, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'split_block_batches',
        summary: `split ${artifact.blocks.length} source blocks into ${planEntries.length} worker batches`,
        evidence: [resolvedInput.absolutePath],
        touchedFiles: [resolvedOutput.projectPath, ...planEntries.map((entry) => entry.inputArtifact)],
        data: {
          manifestId: artifact.manifestId,
          totalBlocks: artifact.blocks.length,
          batchCount: planEntries.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Split source blocks: ${artifact.blocks.length}`,
          `Worker batches: ${planEntries.length}`,
          `Artifact: ${resolvedOutput.projectPath}`
        ].join('\n')
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}

function parseBlocksArtifact(content: string): SplitResourceBlocksArtifactShape {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || typeof value.manifestId !== 'string' || typeof value.rawPath !== 'string' || !Array.isArray(value.blocks)) {
    throw new Error('Invalid split resource blocks artifact');
  }

  if (!value.blocks.every(isKnowledgeResourceBlock)) {
    throw new Error('Invalid split resource blocks artifact');
  }

  return {
    manifestId: value.manifestId,
    rawPath: value.rawPath,
    blocks: value.blocks
  };
}

function chunkBlocks(blocks: KnowledgeResourceBlock[], batchSize: number): KnowledgeResourceBlock[][] {
  const chunks: KnowledgeResourceBlock[][] = [];

  for (let index = 0; index < blocks.length; index += batchSize) {
    chunks.push(blocks.slice(index, index + batchSize));
  }

  return chunks;
}

function isKnowledgeResourceBlock(value: unknown): value is KnowledgeResourceBlock {
  return (
    isRecord(value) &&
    typeof value.blockId === 'string' &&
    Array.isArray(value.headingPath) &&
    value.headingPath.every((entry) => typeof entry === 'string') &&
    typeof value.locator === 'string' &&
    typeof value.text === 'string' &&
    typeof value.kind === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
