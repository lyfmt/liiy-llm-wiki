import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { TopicCatalogEntry } from './resolve-topic-hosts.js';
import type { PreparedSourceResourceArtifact } from './prepare-source-resource.js';
import type { MergedExtractedKnowledgeArtifact } from './merge-extracted-knowledge.js';
import type { NormalizedKnowledgeSection } from './merge-section-candidates.js';

const parameters = Type.Object({
  preparedResourceArtifact: Type.String({ description: 'Prepared source resource artifact under state/artifacts/.' }),
  mergedKnowledgeArtifact: Type.String({ description: 'Merged extracted knowledge artifact under state/artifacts/.' }),
  sectionsArtifact: Type.String({ description: 'Normalized sections artifact under state/artifacts/.' }),
  topicCatalogArtifact: Type.String({ description: 'Topic catalog artifact for reuse decisions.' }),
  outputArtifact: Type.String({ description: 'Artifact path for source topic planning JSON.' })
});

export type ResolveSourceTopicsParameters = Static<typeof parameters>;

export type SourceTopicDecision = 'reuse-topic' | 'create-topic' | 'conflict';

export interface SourceTopicPlanEntry {
  sourceTopicId: string;
  decision: SourceTopicDecision;
  topicSlug: string;
  topicTitle: string;
  sectionIds: string[];
}

export interface SourceTopicPlanningArtifact {
  sourceTopics: SourceTopicPlanEntry[];
}

interface SourceTopicCandidateGroup {
  candidateSlug: string;
  candidateTitle: string;
  sectionIds: string[];
  candidateValues: string[];
  hasSourceWideEvidence: boolean;
}

export function createResolveSourceTopicsTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'resolve_source_topics',
    label: 'Resolve Source Topics',
    description:
      'Plan topic reuse or creation at the source level, then group related sections into shared source topic decisions.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedPrepared = resolveStateArtifactPath(runtimeContext.root, params.preparedResourceArtifact);
      const resolvedMergedKnowledge = resolveStateArtifactPath(runtimeContext.root, params.mergedKnowledgeArtifact);
      const resolvedSections = resolveStateArtifactPath(runtimeContext.root, params.sectionsArtifact);
      const resolvedTopicCatalog = resolveStateArtifactPath(runtimeContext.root, params.topicCatalogArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);

      const preparedResource = parsePreparedResourceArtifact(await readFile(resolvedPrepared.absolutePath, 'utf8'));
      const mergedKnowledge = parseMergedKnowledgeArtifact(await readFile(resolvedMergedKnowledge.absolutePath, 'utf8'));
      const sections = parseSections(await readFile(resolvedSections.absolutePath, 'utf8'));
      const topicCatalog = parseTopicCatalog(await readFile(resolvedTopicCatalog.absolutePath, 'utf8'));
      const artifact: SourceTopicPlanningArtifact = {
        sourceTopics: resolveSourceTopics(preparedResource, mergedKnowledge, sections, topicCatalog)
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'resolve_source_topics',
        summary: `resolved source topic plan for ${sections.length} sections into ${artifact.sourceTopics.length} source topics`,
        evidence: [
          resolvedPrepared.absolutePath,
          resolvedMergedKnowledge.absolutePath,
          resolvedSections.absolutePath,
          resolvedTopicCatalog.absolutePath
        ],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          manifestId: preparedResource.manifestId,
          mergedSectionCandidateCount: mergedKnowledge.sectionCandidates.length,
          sectionCount: sections.length,
          sourceTopicCount: artifact.sourceTopics.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Resolved source topic plan from manifest: ${preparedResource.manifestId}`,
          `Sections: ${sections.length}`,
          `Source topics: ${artifact.sourceTopics.length}`,
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

function resolveSourceTopics(
  preparedResource: PreparedSourceResourceArtifact,
  mergedKnowledge: MergedExtractedKnowledgeArtifact,
  sections: NormalizedKnowledgeSection[],
  topicCatalog: TopicCatalogEntry[]
): SourceTopicPlanEntry[] {
  const candidateGroups = buildSourceTopicCandidateGroups(preparedResource, mergedKnowledge, sections, topicCatalog);
  const decidedTopics: SourceTopicPlanEntry[] = candidateGroups.map((group) => {
    const matchedTopics = findTopicMatches(group.candidateValues, topicCatalog);

    if (matchedTopics.length === 1) {
      const topic = matchedTopics[0]!;
      return {
        sourceTopicId: '',
        decision: 'reuse-topic',
        topicSlug: topic.topicSlug,
        topicTitle: topic.title,
        sectionIds: group.sectionIds
      };
    }

    if (matchedTopics.length > 1) {
      return {
        sourceTopicId: '',
        decision: 'conflict',
        topicSlug: group.candidateSlug,
        topicTitle: group.candidateTitle,
        sectionIds: group.sectionIds
      };
    }

    return {
      sourceTopicId: '',
      decision: 'create-topic',
      topicSlug: group.candidateSlug,
      topicTitle: group.candidateTitle,
      sectionIds: group.sectionIds
    };
  });

  return consolidateSourceTopics(decidedTopics).map((entry, index) => ({
    ...entry,
    sourceTopicId: `source-topic-${String(index + 1).padStart(3, '0')}`
  }));
}

function buildSourceTopicCandidateGroups(
  preparedResource: PreparedSourceResourceArtifact,
  mergedKnowledge: MergedExtractedKnowledgeArtifact,
  sections: NormalizedKnowledgeSection[],
  topicCatalog: TopicCatalogEntry[]
): SourceTopicCandidateGroup[] {
  const sourceWideHints = uniqueStringValues([
    ...readStringArray(preparedResource.topicHints),
    ...readMergedKnowledgeTopicHints(mergedKnowledge.topicHints)
  ]);
  const groups = new Map<string, SourceTopicCandidateGroup>();

  for (const hint of sourceWideHints) {
    const candidate = buildCandidateTopicFromHint(hint);
    appendCandidateGroup(groups, `source:${candidate.topicSlug}`, {
      candidateSlug: candidate.topicSlug,
      candidateTitle: candidate.topicTitle,
      sectionIds: [],
      candidateValues: [hint, candidate.topicSlug, candidate.topicTitle],
      hasSourceWideEvidence: true
    });
  }

  const sourceWideGroups = [...groups.values()].filter((group) => group.hasSourceWideEvidence);
  const sourceWideReuseAttachmentGroup = resolveSourceWideReuseAttachmentGroup(sourceWideGroups, topicCatalog);
  const soleSourceWideGroup = sourceWideGroups.length === 1 ? sourceWideGroups[0]! : null;

  for (const section of sections) {
    const explicitHints = section.topicHints.filter((hint) => hint.trim().length > 0);
    const matchingSourceWideGroups = sourceWideGroups.filter((group) =>
      explicitHints.some((hint) => normalizeValue(hint) === normalizeValue(group.candidateSlug))
    );

    if (matchingSourceWideGroups.length === 1) {
      appendSectionToGroup(matchingSourceWideGroups[0]!, section);
      continue;
    }

    if (matchingSourceWideGroups.length > 1) {
      const candidate = buildCandidateTopic(section);
      appendCandidateGroup(groups, `conflict:${section.sectionId}`, {
        candidateSlug: candidate.topicSlug,
        candidateTitle: candidate.topicTitle,
        sectionIds: [section.sectionId],
        candidateValues: [section.title, ...explicitHints, candidate.topicSlug, candidate.topicTitle],
        hasSourceWideEvidence: false
      });
      continue;
    }

    if (explicitHints.length > 0) {
      const candidate = buildCandidateTopicFromHint(explicitHints[0]!);
      const group = appendCandidateGroup(groups, `local:${candidate.topicSlug}`, {
        candidateSlug: candidate.topicSlug,
        candidateTitle: candidate.topicTitle,
        sectionIds: [],
        candidateValues: [candidate.topicSlug, candidate.topicTitle],
        hasSourceWideEvidence: false
      });
      appendSectionToGroup(group, section);
      continue;
    }

    if (sourceWideReuseAttachmentGroup) {
      appendSectionToGroup(sourceWideReuseAttachmentGroup, section);
      continue;
    }

    if (soleSourceWideGroup) {
      appendSectionToGroup(soleSourceWideGroup, section);
      continue;
    }

    const candidate = buildCandidateTopic(section);
    const group = appendCandidateGroup(groups, `local:${candidate.topicSlug}`, {
      candidateSlug: candidate.topicSlug,
      candidateTitle: candidate.topicTitle,
      sectionIds: [],
      candidateValues: [candidate.topicSlug, candidate.topicTitle],
      hasSourceWideEvidence: false
    });
    appendSectionToGroup(group, section);
  }

  return [...groups.values()].filter((group) => group.hasSourceWideEvidence || group.sectionIds.length > 0);
}

function resolveSourceWideReuseAttachmentGroup(
  sourceWideGroups: SourceTopicCandidateGroup[],
  topicCatalog: TopicCatalogEntry[]
): SourceTopicCandidateGroup | null {
  const resolvedMatches = sourceWideGroups.map((group) => {
    const matchedTopics = findTopicMatches(group.candidateValues, topicCatalog);
    return {
      group,
      matchedTopicSlug: matchedTopics.length === 1 ? matchedTopics[0]!.topicSlug : null
    };
  });

  if (resolvedMatches.length === 0 || resolvedMatches.some((entry) => entry.matchedTopicSlug === null)) {
    return null;
  }

  const matchedTopicSlugs = uniqueStringValues(resolvedMatches.map((entry) => entry.matchedTopicSlug!));

  if (matchedTopicSlugs.length !== 1) {
    return null;
  }

  return resolvedMatches[0]!.group;
}

function appendCandidateGroup(
  groups: Map<string, SourceTopicCandidateGroup>,
  key: string,
  entry: SourceTopicCandidateGroup
): SourceTopicCandidateGroup {
  const existing = groups.get(key);

  if (existing) {
    existing.sectionIds = uniqueStringValues([...existing.sectionIds, ...entry.sectionIds]);
    existing.candidateValues = uniqueStringValues([...existing.candidateValues, ...entry.candidateValues]);
    existing.hasSourceWideEvidence = existing.hasSourceWideEvidence || entry.hasSourceWideEvidence;
    return existing;
  }

  groups.set(key, {
    ...entry,
    sectionIds: [...entry.sectionIds],
    candidateValues: [...entry.candidateValues]
  });

  return groups.get(key)!;
}

function appendSectionToGroup(group: SourceTopicCandidateGroup, section: NormalizedKnowledgeSection): void {
  group.sectionIds = uniqueStringValues([...group.sectionIds, section.sectionId]);
  group.candidateValues = uniqueStringValues([
    ...group.candidateValues,
    section.title,
    ...section.topicHints
  ]);
}

function consolidateSourceTopics(entries: SourceTopicPlanEntry[]): SourceTopicPlanEntry[] {
  const consolidated: SourceTopicPlanEntry[] = [];
  const reuseTopicIndex = new Map<string, number>();

  for (const entry of entries) {
    if (entry.decision !== 'reuse-topic') {
      consolidated.push(entry);
      continue;
    }

    const existingIndex = reuseTopicIndex.get(entry.topicSlug);

    if (existingIndex === undefined) {
      reuseTopicIndex.set(entry.topicSlug, consolidated.length);
      consolidated.push({
        ...entry,
        sectionIds: sortStringValues(entry.sectionIds)
      });
      continue;
    }

    const existing = consolidated[existingIndex]!;
    existing.sectionIds = sortStringValues(uniqueStringValues([...existing.sectionIds, ...entry.sectionIds]));
  }

  return consolidated;
}

function buildCandidateTopic(section: NormalizedKnowledgeSection): { topicSlug: string; topicTitle: string } {
  const primaryHint = section.topicHints.find((hint) => hint.trim().length > 0);

  if (primaryHint) {
    return buildCandidateTopicFromHint(primaryHint, section.title);
  }

  return {
    topicSlug: slugify(section.title),
    topicTitle: section.title
  };
}

function buildCandidateTopicFromHint(
  hint: string,
  fallbackTitle = hint
): { topicSlug: string; topicTitle: string } {
  const topicSlug = slugify(hint);
  return {
    topicSlug: topicSlug.length > 0 ? topicSlug : slugify(fallbackTitle),
    topicTitle: humanizeTopicValue(hint) || fallbackTitle
  };
}

function parsePreparedResourceArtifact(content: string): PreparedSourceResourceArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || typeof value.manifestId !== 'string' || typeof value.rawPath !== 'string') {
    throw new Error('Invalid prepared source resource artifact');
  }

  return value as unknown as PreparedSourceResourceArtifact;
}

function parseMergedKnowledgeArtifact(content: string): MergedExtractedKnowledgeArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.sectionCandidates)) {
    throw new Error('Invalid merged extracted knowledge artifact');
  }

  return value as unknown as MergedExtractedKnowledgeArtifact;
}

function parseSections(content: string): NormalizedKnowledgeSection[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.sections) || !value.sections.every(isHostResolvableSection)) {
    throw new Error('Invalid normalized sections artifact');
  }

  return value.sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    summary: section.summary,
    body: readString(section.body) ?? section.summary,
    entityIds: readStringArray(section.entityIds),
    assertionIds: readStringArray(section.assertionIds),
    evidenceAnchorIds: readStringArray(section.evidenceAnchorIds),
    sourceSectionCandidateIds: readStringArray(section.sourceSectionCandidateIds),
    topicHints: readStringArray(section.topicHints)
  }));
}

function parseTopicCatalog(content: string): TopicCatalogEntry[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.topics) || !value.topics.every(isTopicCatalogEntry)) {
    throw new Error('Invalid topic catalog artifact');
  }

  return value.topics;
}

function findTopicMatches(candidateValues: string[], topicCatalog: TopicCatalogEntry[]): TopicCatalogEntry[] {
  const normalizedCandidateValues = uniqueStringValues(candidateValues.map(normalizeValue));
  const matches = new Map<string, TopicCatalogEntry>();

  for (const topic of topicCatalog) {
    const topicValues = uniqueStringValues([topic.topicSlug, topic.title, ...topic.aliases].map(normalizeValue));

    if (topicValues.some((value) => normalizedCandidateValues.includes(value))) {
      matches.set(topic.topicSlug, topic);
    }
  }

  return [...matches.values()];
}

function isHostResolvableSection(
  value: unknown
): value is Pick<NormalizedKnowledgeSection, 'sectionId' | 'title' | 'summary'> & Partial<NormalizedKnowledgeSection> {
  return (
    isRecord(value) &&
    typeof value.sectionId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string'
  );
}

function isTopicCatalogEntry(value: unknown): value is TopicCatalogEntry {
  return (
    isRecord(value) &&
    typeof value.topicSlug === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.aliases) &&
    value.aliases.every((alias) => typeof alias === 'string')
  );
}

function slugify(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').replace(/^-+|-+$/gu, '');
  return normalized.length > 0 ? normalized : '';
}

function normalizeValue(value: string): string {
  return slugify(value);
}

function humanizeTopicValue(value: string): string {
  const normalized = value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (normalized.length === 0) {
    return '';
  }

  return normalized.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readMergedKnowledgeTopicHints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }

      if (!isRecord(entry)) {
        return null;
      }

      return readString(entry.topicSlug) ?? readString(entry.slug) ?? readString(entry.topicTitle) ?? readString(entry.title);
    })
    .filter((entry): entry is string => entry !== null);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function uniqueStringValues(values: string[]): string[] {
  return [...new Set(values)];
}

function sortStringValues(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
