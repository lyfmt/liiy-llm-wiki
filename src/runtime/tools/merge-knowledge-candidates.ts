import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  inputArtifacts: Type.Array(Type.String({ description: 'Extractor batch artifacts to merge.' })),
  outputArtifact: Type.String({ description: 'Artifact path for the merged candidate JSON.' })
});

export type MergeKnowledgeCandidatesParameters = Static<typeof parameters>;

export interface KnowledgeEntityCandidate {
  entityId: string;
  name: string;
  [key: string]: unknown;
}

export interface KnowledgeAssertionCandidate {
  assertionId: string;
  text: string;
  [key: string]: unknown;
}

export interface KnowledgeRelationCandidate {
  relationId: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  [key: string]: unknown;
}

export interface KnowledgeEvidenceAnchor {
  anchorId: string;
  blockId: string;
  quote: string;
  [key: string]: unknown;
}

export interface MergedKnowledgeCandidatesArtifact {
  inputArtifacts: string[];
  entities: KnowledgeEntityCandidate[];
  assertions: KnowledgeAssertionCandidate[];
  relations: KnowledgeRelationCandidate[];
  evidenceAnchors: KnowledgeEvidenceAnchor[];
}

export function createMergeKnowledgeCandidatesTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'merge_knowledge_candidates',
    label: 'Merge Knowledge Candidates',
    description:
      'Merge multiple extractor batch artifacts into a deduplicated set of entities, assertions, relations, and evidence anchors.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedInputs = params.inputArtifacts.map((artifactPath) =>
        resolveStateArtifactPath(runtimeContext.root, artifactPath)
      );
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const batches = await Promise.all(
        resolvedInputs.map(async (resolved) => parseKnowledgeCandidateBatch(await readFile(resolved.absolutePath, 'utf8')))
      );
      const merged: MergedKnowledgeCandidatesArtifact = {
        inputArtifacts: resolvedInputs.map((resolved) => resolved.projectPath),
        entities: dedupeCandidates(batches.flatMap((batch) => batch.entities), 'entityId'),
        assertions: dedupeCandidates(batches.flatMap((batch) => batch.assertions), 'assertionId'),
        relations: dedupeCandidates(batches.flatMap((batch) => batch.relations), 'relationId'),
        evidenceAnchors: dedupeCandidates(batches.flatMap((batch) => batch.evidenceAnchors), 'anchorId')
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'merge_knowledge_candidates',
        summary: `merged ${resolvedInputs.length} knowledge candidate batches`,
        evidence: resolvedInputs.map((resolved) => resolved.absolutePath),
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          entityCount: merged.entities.length,
          assertionCount: merged.assertions.length,
          relationCount: merged.relations.length,
          evidenceAnchorCount: merged.evidenceAnchors.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Merged candidate batches: ${resolvedInputs.length}`,
          `Entities: ${merged.entities.length}`,
          `Assertions: ${merged.assertions.length}`,
          `Relations: ${merged.relations.length}`,
          `Evidence anchors: ${merged.evidenceAnchors.length}`,
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

function parseKnowledgeCandidateBatch(content: string): MergedKnowledgeCandidatesArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value)) {
    throw new Error('Invalid knowledge candidate batch artifact');
  }

  return {
    inputArtifacts: [],
    entities: asTypedArray(value.entities, isKnowledgeEntityCandidate),
    assertions: asTypedArray(value.assertions, isKnowledgeAssertionCandidate),
    relations: asTypedArray(value.relations, isKnowledgeRelationCandidate),
    evidenceAnchors: asTypedArray(value.evidenceAnchors, isKnowledgeEvidenceAnchor)
  };
}

function dedupeCandidates<T extends Record<string, unknown>>(items: T[], idField: string): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of items) {
    const key = typeof item[idField] === 'string' ? String(item[idField]) : JSON.stringify(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function asTypedArray<T>(value: unknown, guard: (entry: unknown) => entry is T): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(guard);
}

function isKnowledgeEntityCandidate(value: unknown): value is KnowledgeEntityCandidate {
  return isRecord(value) && typeof value.entityId === 'string' && typeof value.name === 'string';
}

function isKnowledgeAssertionCandidate(value: unknown): value is KnowledgeAssertionCandidate {
  return isRecord(value) && typeof value.assertionId === 'string' && typeof value.text === 'string';
}

function isKnowledgeRelationCandidate(value: unknown): value is KnowledgeRelationCandidate {
  return (
    isRecord(value) &&
    typeof value.relationId === 'string' &&
    typeof value.fromEntityId === 'string' &&
    typeof value.toEntityId === 'string' &&
    typeof value.relationType === 'string'
  );
}

function isKnowledgeEvidenceAnchor(value: unknown): value is KnowledgeEvidenceAnchor {
  return isRecord(value) && typeof value.anchorId === 'string' && typeof value.blockId === 'string' && typeof value.quote === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
