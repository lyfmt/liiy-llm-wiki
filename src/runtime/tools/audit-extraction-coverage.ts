import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { KnowledgeEvidenceAnchor } from './merge-knowledge-candidates.js';
import type { KnowledgeResourceBlock } from './split-resource-blocks.js';

const parameters = Type.Object({
  blocksArtifact: Type.String({ description: 'Artifact path for the split resource blocks JSON.' }),
  mergedCandidatesArtifact: Type.String({ description: 'Artifact path for the merged knowledge candidates JSON.' }),
  outputArtifact: Type.String({ description: 'Artifact path for the coverage audit JSON.' }),
  minimumEvidenceAnchorsPerBlock: Type.Optional(
    Type.Number({ description: 'Minimum number of evidence anchors required for a block to count as complete.', minimum: 1, maximum: 10 })
  )
});

export type AuditExtractionCoverageParameters = Static<typeof parameters>;

export interface ExtractionCoverageAuditArtifact {
  status: 'passed' | 'failed';
  coverage: {
    totalBlocks: number;
    completedBlocks: number;
    sparseBlockIds: string[];
    missingBlockIds: string[];
    minimumEvidenceAnchorsPerBlock: number;
  };
}

export function createAuditExtractionCoverageTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'audit_extraction_coverage',
    label: 'Audit Extraction Coverage',
    description:
      'Audit merged extraction coverage against split knowledge blocks and fail when blocks are sparse or missing evidence.',
    parameters,
    execute: async (_toolCallId, params) => {
      const minimumEvidenceAnchorsPerBlock = params.minimumEvidenceAnchorsPerBlock ?? 2;
      const resolvedBlocks = resolveStateArtifactPath(runtimeContext.root, params.blocksArtifact);
      const resolvedMerged = resolveStateArtifactPath(runtimeContext.root, params.mergedCandidatesArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const blocks = parseBlocksArtifact(await readFile(resolvedBlocks.absolutePath, 'utf8'));
      const evidenceAnchors = parseEvidenceAnchors(await readFile(resolvedMerged.absolutePath, 'utf8'));
      const anchorCounts = countAnchorsByBlock(evidenceAnchors);
      const sparseBlockIds: string[] = [];
      const missingBlockIds: string[] = [];
      let completedBlocks = 0;

      for (const block of blocks) {
        const anchorCount = anchorCounts.get(block.blockId) ?? 0;

        if (anchorCount >= minimumEvidenceAnchorsPerBlock) {
          completedBlocks += 1;
          continue;
        }

        if (anchorCount > 0) {
          sparseBlockIds.push(block.blockId);
          continue;
        }

        missingBlockIds.push(block.blockId);
      }

      const audit: ExtractionCoverageAuditArtifact = {
        status: sparseBlockIds.length === 0 && missingBlockIds.length === 0 ? 'passed' : 'failed',
        coverage: {
          totalBlocks: blocks.length,
          completedBlocks,
          sparseBlockIds,
          missingBlockIds,
          minimumEvidenceAnchorsPerBlock
        }
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'audit_extraction_coverage',
        summary: audit.status === 'passed' ? 'coverage audit passed' : 'coverage audit failed',
        evidence: [resolvedBlocks.absolutePath, resolvedMerged.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: audit as unknown as Record<string, unknown>,
        resultMarkdown: [
          `Coverage status: ${audit.status}`,
          `Completed blocks: ${audit.coverage.completedBlocks}/${audit.coverage.totalBlocks}`,
          `Sparse blocks: ${audit.coverage.sparseBlockIds.join(', ') || '_none_'}`,
          `Missing blocks: ${audit.coverage.missingBlockIds.join(', ') || '_none_'}`,
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

function parseBlocksArtifact(content: string): KnowledgeResourceBlock[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    throw new Error('Invalid split resource blocks artifact');
  }

  return value.blocks.filter(isKnowledgeBlock);
}

function parseEvidenceAnchors(content: string): KnowledgeEvidenceAnchor[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.evidenceAnchors)) {
    throw new Error('Invalid merged knowledge candidates artifact');
  }

  return value.evidenceAnchors.filter(isEvidenceAnchor);
}

function countAnchorsByBlock(evidenceAnchors: KnowledgeEvidenceAnchor[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const anchor of evidenceAnchors) {
    counts.set(anchor.blockId, (counts.get(anchor.blockId) ?? 0) + 1);
  }

  return counts;
}

function isKnowledgeBlock(value: unknown): value is KnowledgeResourceBlock {
  return isRecord(value) && typeof value.blockId === 'string' && typeof value.locator === 'string' && typeof value.text === 'string';
}

function isEvidenceAnchor(value: unknown): value is KnowledgeEvidenceAnchor {
  return isRecord(value) && typeof value.anchorId === 'string' && typeof value.blockId === 'string' && typeof value.quote === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
