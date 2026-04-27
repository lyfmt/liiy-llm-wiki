import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { NormalizedKnowledgeSection } from './merge-section-candidates.js';

const parameters = Type.Object({
  sectionsArtifact: Type.String({ description: 'Normalized sections artifact under state/artifacts/.' }),
  topicCatalogArtifact: Type.String({ description: 'Topic catalog artifact for host reuse decisions.' }),
  outputArtifact: Type.String({ description: 'Artifact path for hosted sections JSON.' })
});

export type ResolveTopicHostsParameters = Static<typeof parameters>;

export interface TopicCatalogEntry {
  topicSlug: string;
  title: string;
  aliases: string[];
}

export interface HostedKnowledgeSection extends NormalizedKnowledgeSection {
  hostAction: 'reuse-topic' | 'create-topic' | 'conflict' | 'hint-only';
  hostTopicSlug?: string;
  suggestedTopicSlug?: string;
  suggestedTopicTitle?: string;
}

export interface TopicHostingArtifact {
  sections: HostedKnowledgeSection[];
}

export function createResolveTopicHostsTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'resolve_topic_hosts',
    label: 'Resolve Topic Hosts',
    description:
      'Resolve a durable topic host for every normalized section by reusing an existing topic when possible or suggesting a new one.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedSections = resolveStateArtifactPath(runtimeContext.root, params.sectionsArtifact);
      const resolvedTopics = resolveStateArtifactPath(runtimeContext.root, params.topicCatalogArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const sections = parseSections(await readFile(resolvedSections.absolutePath, 'utf8'));
      const topicCatalog = parseTopicCatalog(await readFile(resolvedTopics.absolutePath, 'utf8'));
      const hostedSections = sections.map((section) => resolveHost(section, topicCatalog));
      const artifact: TopicHostingArtifact = {
        sections: hostedSections
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'resolve_topic_hosts',
        summary: `resolved topic hosts for ${sections.length} sections`,
        evidence: [resolvedSections.absolutePath, resolvedTopics.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          sectionCount: sections.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Resolved section hosts: ${sections.length}`,
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

function resolveHost(section: NormalizedKnowledgeSection, topicCatalog: TopicCatalogEntry[]): HostedKnowledgeSection {
  const matchedTopics = findTopicMatches(section, topicCatalog);

  if (matchedTopics.length === 1) {
    return {
      ...section,
      hostAction: 'reuse-topic',
      hostTopicSlug: matchedTopics[0]!.topicSlug
    };
  }

  if (matchedTopics.length > 1) {
    return {
      ...section,
      hostAction: 'conflict',
      suggestedTopicSlug: slugify(section.title),
      suggestedTopicTitle: section.title
    };
  }

  return {
    ...section,
    hostAction: 'create-topic',
    suggestedTopicSlug: slugify(section.title),
    suggestedTopicTitle: section.title
  };
}

function findTopicMatches(section: NormalizedKnowledgeSection, topicCatalog: TopicCatalogEntry[]): TopicCatalogEntry[] {
  const matches = new Map<string, TopicCatalogEntry>();

  for (const topic of topicCatalog) {
    if (section.topicHints.includes(topic.topicSlug)) {
      matches.set(topic.topicSlug, topic);
      continue;
    }

    const topicNames = [topic.title, ...topic.aliases].map(normalizeValue);
    const normalizedSectionTitle = normalizeValue(section.title);

    if (topicNames.includes(normalizedSectionTitle)) {
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
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-');
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
