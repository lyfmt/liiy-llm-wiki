import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { BuiltTaxonomyCatalogEntry } from './build-taxonomy-catalog.js';
import type { SourceTopicDecision, SourceTopicPlanEntry } from './resolve-source-topics.js';

const parameters = Type.Object({
  sourceTopicsArtifact: Type.String({ description: 'Source topic planning artifact under state/artifacts/.' }),
  taxonomyCatalogArtifact: Type.String({ description: 'Taxonomy catalog artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for topic taxonomy planning JSON.' })
});

export type ResolveTopicTaxonomyParameters = Static<typeof parameters>;

export type TopicTaxonomyAction = 'attach-existing' | 'create-taxonomy-node' | 'merge-into-existing' | 'conflict';

export interface TopicTaxonomyPlacement {
  rootTaxonomySlug: string | null;
  parentTaxonomySlug: string | null;
  leafTaxonomySlug: string | null;
}

export interface TopicTaxonomyPlanEntry {
  sourceTopicId: string;
  topicSlug: string;
  topicTitle: string;
  topicAction: SourceTopicDecision;
  sectionIds: string[];
  taxonomyAction: TopicTaxonomyAction;
  taxonomySlug: string | null;
  taxonomy: TopicTaxonomyPlacement;
  conflictTaxonomySlugs: string[];
}

export interface TopicTaxonomyPlanningArtifact {
  topics: TopicTaxonomyPlanEntry[];
}

export function createResolveTopicTaxonomyTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'resolve_topic_taxonomy',
    label: 'Resolve Topic Taxonomy',
    description:
      'Resolve how each source topic attaches into the taxonomy tree, preserving root-parent-leaf placement for downstream graph and wiki writes.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedSourceTopics = resolveStateArtifactPath(runtimeContext.root, params.sourceTopicsArtifact);
      const resolvedTaxonomyCatalog = resolveStateArtifactPath(runtimeContext.root, params.taxonomyCatalogArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const sourceTopics = parseSourceTopics(await readFile(resolvedSourceTopics.absolutePath, 'utf8'));
      const taxonomyCatalog = parseTaxonomyCatalog(await readFile(resolvedTaxonomyCatalog.absolutePath, 'utf8'));
      const artifact: TopicTaxonomyPlanningArtifact = {
        topics: sourceTopics.map((topic) => resolveTopicTaxonomy(topic, taxonomyCatalog))
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'resolve_topic_taxonomy',
        summary: `resolved taxonomy hosting for ${artifact.topics.length} topics`,
        evidence: [resolvedSourceTopics.absolutePath, resolvedTaxonomyCatalog.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          topicCount: artifact.topics.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Resolved taxonomy topics: ${artifact.topics.length}`,
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

function resolveTopicTaxonomy(
  sourceTopic: SourceTopicPlanEntry,
  taxonomyCatalog: BuiltTaxonomyCatalogEntry[]
): TopicTaxonomyPlanEntry {
  if (sourceTopic.decision === 'conflict') {
    return createConflictEntry(sourceTopic, []);
  }

  const directMatches = findTaxonomyMatches([sourceTopic.topicSlug, sourceTopic.topicTitle], taxonomyCatalog);
  const inferredTaxonomySlug = inferTaxonomyNodeSlug(sourceTopic);
  const inferredMatches = findTaxonomyMatches([inferredTaxonomySlug], taxonomyCatalog);
  const conflictingMatchSlugs = findConflictingMatchSlugs(directMatches, inferredMatches);

  if (conflictingMatchSlugs.length > 0) {
    return createConflictEntry(sourceTopic, conflictingMatchSlugs);
  }

  if (directMatches.length > 1) {
    return createConflictEntry(sourceTopic, directMatches.map((entry) => entry.taxonomySlug));
  }

  if (directMatches.length === 1) {
    const match = directMatches[0]!;

    return createResolvedEntry(
      sourceTopic,
      sourceTopic.decision === 'reuse-topic' ? 'attach-existing' : 'merge-into-existing',
      match.taxonomySlug,
      {
        rootTaxonomySlug: match.rootTaxonomySlug,
        parentTaxonomySlug: match.parentTaxonomySlug,
        leafTaxonomySlug: match.taxonomySlug
      }
    );
  }

  if (inferredMatches.length > 1) {
    return createConflictEntry(sourceTopic, inferredMatches.map((entry) => entry.taxonomySlug));
  }

  if (sourceTopic.decision === 'reuse-topic') {
    if (inferredMatches.length === 1) {
      const match = inferredMatches[0]!;

      return createResolvedEntry(sourceTopic, 'attach-existing', match.taxonomySlug, {
        rootTaxonomySlug: match.rootTaxonomySlug,
        parentTaxonomySlug: match.parentTaxonomySlug,
        leafTaxonomySlug: match.taxonomySlug
      });
    }

    const rootMatch = selectDefaultRootTaxonomy(taxonomyCatalog);

    return rootMatch
      ? createResolvedEntry(sourceTopic, 'attach-existing', rootMatch.taxonomySlug, {
          rootTaxonomySlug: rootMatch.rootTaxonomySlug,
          parentTaxonomySlug: rootMatch.parentTaxonomySlug,
          leafTaxonomySlug: rootMatch.taxonomySlug
        })
      : createConflictEntry(sourceTopic, []);
  }

  if (inferredMatches.length === 1) {
    const match = inferredMatches[0]!;

    return createResolvedEntry(sourceTopic, 'merge-into-existing', match.taxonomySlug, {
      rootTaxonomySlug: match.rootTaxonomySlug,
      parentTaxonomySlug: match.parentTaxonomySlug,
      leafTaxonomySlug: match.taxonomySlug
    });
  }

  if (taxonomyCatalog.length > 0) {
    const rootMatch = selectDefaultRootTaxonomy(taxonomyCatalog);

    if (!rootMatch) {
      return createConflictEntry(sourceTopic, []);
    }

    return createResolvedEntry(sourceTopic, 'create-taxonomy-node', inferredTaxonomySlug, {
      rootTaxonomySlug: rootMatch.rootTaxonomySlug,
      parentTaxonomySlug: rootMatch.taxonomySlug,
      leafTaxonomySlug: inferredTaxonomySlug
    });
  }

  return createResolvedEntry(sourceTopic, 'create-taxonomy-node', inferredTaxonomySlug, {
    rootTaxonomySlug: inferredTaxonomySlug,
    parentTaxonomySlug: null,
    leafTaxonomySlug: inferredTaxonomySlug
  });
}

function createResolvedEntry(
  sourceTopic: SourceTopicPlanEntry,
  taxonomyAction: Exclude<TopicTaxonomyAction, 'conflict'>,
  taxonomySlug: string,
  taxonomy: TopicTaxonomyPlacement
): TopicTaxonomyPlanEntry {
  return {
    sourceTopicId: sourceTopic.sourceTopicId,
    topicSlug: sourceTopic.topicSlug,
    topicTitle: sourceTopic.topicTitle,
    topicAction: sourceTopic.decision,
    sectionIds: [...sourceTopic.sectionIds],
    taxonomyAction,
    taxonomySlug,
    taxonomy,
    conflictTaxonomySlugs: []
  };
}

function createConflictEntry(sourceTopic: SourceTopicPlanEntry, conflictTaxonomySlugs: string[]): TopicTaxonomyPlanEntry {
  return {
    sourceTopicId: sourceTopic.sourceTopicId,
    topicSlug: sourceTopic.topicSlug,
    topicTitle: sourceTopic.topicTitle,
    topicAction: sourceTopic.decision,
    sectionIds: [...sourceTopic.sectionIds],
    taxonomyAction: 'conflict',
    taxonomySlug: null,
    taxonomy: {
      rootTaxonomySlug: null,
      parentTaxonomySlug: null,
      leafTaxonomySlug: null
    },
    conflictTaxonomySlugs: uniqueStrings(conflictTaxonomySlugs)
  };
}

function parseSourceTopics(content: string): SourceTopicPlanEntry[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.sourceTopics) || !value.sourceTopics.every(isSourceTopicPlanEntry)) {
    throw new Error('Invalid source topics artifact');
  }

  return value.sourceTopics;
}

function parseTaxonomyCatalog(content: string): BuiltTaxonomyCatalogEntry[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.taxonomy) || !value.taxonomy.every(isTaxonomyCatalogEntry)) {
    throw new Error('Invalid taxonomy catalog artifact');
  }

  return value.taxonomy;
}

function isSourceTopicPlanEntry(value: unknown): value is SourceTopicPlanEntry {
  return (
    isRecord(value) &&
    typeof value.sourceTopicId === 'string' &&
    isSourceTopicDecision(value.decision) &&
    typeof value.topicSlug === 'string' &&
    typeof value.topicTitle === 'string' &&
    Array.isArray(value.sectionIds) &&
    value.sectionIds.every((entry) => typeof entry === 'string')
  );
}

function isSourceTopicDecision(value: unknown): value is SourceTopicDecision {
  return value === 'reuse-topic' || value === 'create-topic' || value === 'conflict';
}

function isTaxonomyCatalogEntry(value: unknown): value is BuiltTaxonomyCatalogEntry {
  return (
    isRecord(value) &&
    typeof value.taxonomySlug === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.aliases) &&
    value.aliases.every((entry) => typeof entry === 'string') &&
    typeof value.summary === 'string' &&
    (typeof value.parentTaxonomySlug === 'string' || value.parentTaxonomySlug === null) &&
    typeof value.rootTaxonomySlug === 'string' &&
    typeof value.isRoot === 'boolean'
  );
}

function findTaxonomyMatches(
  candidateValues: string[],
  taxonomyCatalog: BuiltTaxonomyCatalogEntry[]
): BuiltTaxonomyCatalogEntry[] {
  const normalizedCandidates = uniqueStrings(candidateValues.map(normalizeValue).filter((entry) => entry.length > 0));
  const matches = new Map<string, BuiltTaxonomyCatalogEntry>();

  for (const taxonomy of taxonomyCatalog) {
    const normalizedTaxonomyValues = [
      taxonomy.taxonomySlug,
      taxonomy.title,
      ...taxonomy.aliases
    ].map(normalizeValue);

    if (normalizedCandidates.some((candidate) => normalizedTaxonomyValues.includes(candidate))) {
      matches.set(taxonomy.taxonomySlug, taxonomy);
    }
  }

  return [...matches.values()];
}

function selectDefaultRootTaxonomy(taxonomyCatalog: BuiltTaxonomyCatalogEntry[]): BuiltTaxonomyCatalogEntry | null {
  const roots = taxonomyCatalog.filter((entry) => entry.isRoot);
  return roots.length === 1 ? roots[0]! : null;
}

function findConflictingMatchSlugs(
  directMatches: BuiltTaxonomyCatalogEntry[],
  inferredMatches: BuiltTaxonomyCatalogEntry[]
): string[] {
  if (directMatches.length === 0 || inferredMatches.length === 0) {
    return [];
  }

  const directSlugs = uniqueStrings(directMatches.map((entry) => entry.taxonomySlug));
  const inferredSlugs = uniqueStrings(inferredMatches.map((entry) => entry.taxonomySlug));

  if (directSlugs.length === 1 && inferredSlugs.length === 1 && directSlugs[0] === inferredSlugs[0]) {
    return [];
  }

  return uniqueStrings([...directSlugs, ...inferredSlugs]);
}

function inferTaxonomyNodeSlug(sourceTopic: Pick<SourceTopicPlanEntry, 'topicSlug' | 'topicTitle'>): string {
  const tokens = tokenize(`${sourceTopic.topicSlug} ${sourceTopic.topicTitle}`);

  if (tokens.includes('pattern') || tokens.includes('patterns')) {
    return 'patterns';
  }

  if (tokens.includes('taxonomy') || tokens.includes('taxonomies')) {
    return 'taxonomies';
  }

  const firstToken = tokens.find((token) => token.length > 2);

  if (!firstToken) {
    return sourceTopic.topicSlug;
  }

  return pluralizeToken(firstToken);
}

function tokenize(value: string): string[] {
  return normalizeValue(value)
    .split('-')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function pluralizeToken(value: string): string {
  if (value.endsWith('ies') || value.endsWith('s')) {
    return value;
  }

  if (value.endsWith('y')) {
    return `${value.slice(0, -1)}ies`;
  }

  return `${value}s`;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
