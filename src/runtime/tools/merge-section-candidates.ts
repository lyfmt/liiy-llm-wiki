import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { KnowledgeSectionCandidate } from './merge-extracted-knowledge.js';

const parameters = Type.Object({
  mergedKnowledgeArtifact: Type.String({ description: 'Merged extracted knowledge artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for normalized sections JSON.' })
});

export type MergeSectionCandidatesParameters = Static<typeof parameters>;

export interface NormalizedKnowledgeSection {
  sectionId: string;
  title: string;
  summary: string;
  body: string;
  entityIds: string[];
  assertionIds: string[];
  evidenceAnchorIds: string[];
  sourceSectionCandidateIds: string[];
  topicHints: string[];
}

export interface MergedSectionCandidatesArtifact {
  sections: NormalizedKnowledgeSection[];
}

interface NormalizedAssertionCandidate {
  assertionId: string;
  text: string;
  sectionCandidateId?: string;
  evidenceAnchorIds: string[];
}

export function createMergeSectionCandidatesTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'merge_section_candidates',
    label: 'Merge Section Candidates',
    description:
      'Merge repeated section candidates from multiple blocks into normalized wiki insertion sections with aggregated evidence.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedInput = resolveStateArtifactPath(runtimeContext.root, params.mergedKnowledgeArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const mergedKnowledge = parseMergedKnowledgeArtifact(await readFile(resolvedInput.absolutePath, 'utf8'));
      const sections = mergeSectionCandidates(mergedKnowledge.sectionCandidates, mergedKnowledge.assertions);
      const artifact: MergedSectionCandidatesArtifact = { sections };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'merge_section_candidates',
        summary: `merged ${mergedKnowledge.sectionCandidates.length} section candidates into ${sections.length} normalized sections`,
        evidence: [resolvedInput.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          sectionCount: sections.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Merged section candidates: ${mergedKnowledge.sectionCandidates.length}`,
          `Sections: ${sections.length}`,
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

function parseMergedKnowledgeArtifact(content: string): {
  sectionCandidates: KnowledgeSectionCandidate[];
  assertions: NormalizedAssertionCandidate[];
} {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.sectionCandidates) || !value.sectionCandidates.every(isSectionCandidate)) {
    throw new Error('Invalid merged extracted knowledge artifact');
  }

  return {
    sectionCandidates: value.sectionCandidates,
    assertions: Array.isArray(value.assertions) ? value.assertions.map(normalizeAssertionCandidate).filter((entry): entry is NormalizedAssertionCandidate => entry !== null) : []
  };
}

function mergeSectionCandidates(
  sectionCandidates: KnowledgeSectionCandidate[],
  assertions: NormalizedAssertionCandidate[]
): NormalizedKnowledgeSection[] {
  const groups = new Map<string, { title: string; items: KnowledgeSectionCandidate[] }>();

  for (const candidate of sectionCandidates) {
    const key = normalizeTitle(candidate.title);
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(candidate);
      continue;
    }

    groups.set(key, {
      title: candidate.title,
      items: [candidate]
    });
  }

  return [...groups.values()].map((group, index) => ({
    ...buildNormalizedSection(group, assertions, index)
  }));
}

function isSectionCandidate(value: unknown): value is KnowledgeSectionCandidate {
  return (
    isRecord(value) &&
    typeof value.sectionCandidateId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string'
  );
}

function buildNormalizedSection(
  group: { title: string; items: KnowledgeSectionCandidate[] },
  assertions: NormalizedAssertionCandidate[],
  index: number
): NormalizedKnowledgeSection {
  const sourceSectionCandidateIds = group.items.map((item) => item.sectionCandidateId);
  const evidenceAnchorIds = uniqueStringValues(group.items.flatMap((item) => readStringArray(item.evidenceAnchorIds)));
  const relatedAssertions = collectRelatedAssertions(group.items, assertions, sourceSectionCandidateIds, evidenceAnchorIds);
  const assertionIds = uniqueStringValues([
    ...group.items.flatMap((item) => readStringArray(item.assertionIds)),
    ...relatedAssertions.map((assertion) => assertion.assertionId)
  ]);
  const bodyParagraphs = uniqueNonEmptyStrings([
    ...group.items.flatMap((item) => readSectionParagraphs(item)),
    ...relatedAssertions.map((assertion) => assertion.text)
  ]);
  const summary = group.items.map((item) => item.summary.trim()).find((candidate) => candidate.length > 0) ?? '';

  return {
    sectionId: `section-${String(index + 1).padStart(3, '0')}`,
    title: group.title,
    summary,
    body: bodyParagraphs.length > 0 ? bodyParagraphs.join('\n\n') : summary,
    entityIds: uniqueStringValues(group.items.flatMap((item) => readStringArray(item.entityIds))),
    assertionIds,
    evidenceAnchorIds,
    sourceSectionCandidateIds,
    topicHints: uniqueStringValues(group.items.flatMap((item) => readStringArray(item.topicHints)))
  };
}

function collectRelatedAssertions(
  sectionCandidates: KnowledgeSectionCandidate[],
  assertions: NormalizedAssertionCandidate[],
  sourceSectionCandidateIds: string[],
  evidenceAnchorIds: string[]
): NormalizedAssertionCandidate[] {
  const sourceIds = new Set(sourceSectionCandidateIds);
  const evidenceIds = new Set(evidenceAnchorIds);

  return assertions.filter((assertion) => {
    if (assertion.sectionCandidateId && sourceIds.has(assertion.sectionCandidateId)) {
      return true;
    }

    return assertion.evidenceAnchorIds.some((anchorId) => evidenceIds.has(anchorId));
  });
}

function normalizeAssertionCandidate(value: unknown): NormalizedAssertionCandidate | null {
  if (!isRecord(value)) {
    return null;
  }

  const assertionId = readString(value.assertionId) ?? readString(value.id);
  const text = readString(value.text) ?? readString(value.statement);

  if (!assertionId || !text) {
    return null;
  }

  return {
    assertionId,
    text,
    ...(readString(value.sectionCandidateId) ? { sectionCandidateId: readString(value.sectionCandidateId)! } : {}),
    evidenceAnchorIds: uniqueStringValues([
      ...readStringArray(value.evidenceAnchorIds),
      ...readObjectAnchorIds(value.evidenceAnchors)
    ])
  };
}

function readSectionParagraphs(sectionCandidate: KnowledgeSectionCandidate): string[] {
  const candidateBody = readString((sectionCandidate as Record<string, unknown>).body);

  if (candidateBody) {
    return [candidateBody];
  }

  const candidateParagraphs = readStringArray((sectionCandidate as Record<string, unknown>).paragraphs);

  if (candidateParagraphs.length > 0) {
    return candidateParagraphs;
  }

  const summary = sectionCandidate.summary.trim();
  return summary.length > 0 ? [summary] : [];
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-');
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readObjectAnchorIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      return readString(entry.anchorId) ?? readString(entry.id) ?? readString(entry.blockId);
    })
    .filter((entry): entry is string => entry !== null);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function uniqueStringValues(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
