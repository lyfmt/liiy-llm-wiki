import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { TopicTaxonomyPlanEntry } from './resolve-topic-taxonomy.js';

const parameters = Type.Object({
  topicTaxonomyArtifact: Type.String({ description: 'Topic taxonomy planning artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for taxonomy host audit JSON.' })
});

export type AuditTaxonomyHostingParameters = Static<typeof parameters>;

export interface TaxonomyHostingAuditArtifact {
  status: 'passed' | 'failed';
  taxonomy: {
    unhostedTopicSlugs: string[];
    conflictTopicSlugs: string[];
    canWriteGraph: boolean;
    canWriteWiki: boolean;
  };
}

export function createAuditTaxonomyHostingTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'audit_taxonomy_hosting',
    label: 'Audit Taxonomy Hosting',
    description:
      'Audit topic taxonomy placement and block graph or wiki writes while any topic is still outside the taxonomy tree.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedTopicTaxonomy = resolveStateArtifactPath(runtimeContext.root, params.topicTaxonomyArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const topics = parseTopicTaxonomy(await readFile(resolvedTopicTaxonomy.absolutePath, 'utf8'));
      const unhostedTopicSlugs = topics.filter((topic) => !isHostedTopic(topic)).map((topic) => topic.topicSlug);
      const conflictTopicSlugs = topics
        .filter((topic) => topic.taxonomyAction === 'conflict')
        .map((topic) => topic.topicSlug);
      const canWrite = unhostedTopicSlugs.length === 0;
      const audit: TaxonomyHostingAuditArtifact = {
        status: canWrite ? 'passed' : 'failed',
        taxonomy: {
          unhostedTopicSlugs,
          conflictTopicSlugs,
          canWriteGraph: canWrite,
          canWriteWiki: canWrite
        }
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'audit_taxonomy_hosting',
        summary: audit.status === 'passed' ? 'taxonomy host audit passed' : 'taxonomy host audit failed',
        evidence: [resolvedTopicTaxonomy.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: audit as unknown as Record<string, unknown>,
        resultMarkdown: [
          `Taxonomy host status: ${audit.status}`,
          `Unhosted topics: ${audit.taxonomy.unhostedTopicSlugs.join(', ') || '_none_'}`,
          `Conflict topics: ${audit.taxonomy.conflictTopicSlugs.join(', ') || '_none_'}`,
          `Can write graph: ${String(audit.taxonomy.canWriteGraph)}`,
          `Can write wiki: ${String(audit.taxonomy.canWriteWiki)}`,
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

function parseTopicTaxonomy(content: string): TopicTaxonomyPlanEntry[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.topics) || !value.topics.every(isTopicTaxonomyPlanEntry)) {
    throw new Error('Invalid topic taxonomy artifact');
  }

  return value.topics;
}

function isHostedTopic(topic: TopicTaxonomyPlanEntry): boolean {
  if (topic.taxonomyAction === 'conflict') {
    return false;
  }

  const hasRoot = typeof topic.taxonomy.rootTaxonomySlug === 'string' && topic.taxonomy.rootTaxonomySlug.length > 0;
  const hasLeaf = typeof topic.taxonomy.leafTaxonomySlug === 'string' && topic.taxonomy.leafTaxonomySlug.length > 0;
  const hasTaxonomySlug = typeof topic.taxonomySlug === 'string' && topic.taxonomySlug.length > 0;
  const createsRootNode =
    topic.taxonomyAction === 'create-taxonomy-node' &&
    hasRoot &&
    hasLeaf &&
    topic.taxonomy.rootTaxonomySlug === topic.taxonomy.leafTaxonomySlug &&
    topic.taxonomy.parentTaxonomySlug === null;
  const hasParent = typeof topic.taxonomy.parentTaxonomySlug === 'string' && topic.taxonomy.parentTaxonomySlug.length > 0;
  const leafMatchesTaxonomySlug = hasTaxonomySlug && topic.taxonomy.leafTaxonomySlug === topic.taxonomySlug;
  const parentPlacementIsConsistent =
    topic.taxonomy.leafTaxonomySlug === topic.taxonomy.rootTaxonomySlug ? !hasParent : hasParent;

  if (!hasTaxonomySlug || !hasRoot || !hasLeaf || !leafMatchesTaxonomySlug || !parentPlacementIsConsistent) {
    return false;
  }

  if (topic.taxonomyAction === 'create-taxonomy-node') {
    return createsRootNode || hasParent;
  }

  return true;
}

function isTopicTaxonomyPlanEntry(value: unknown): value is TopicTaxonomyPlanEntry {
  return (
    isRecord(value) &&
    typeof value.sourceTopicId === 'string' &&
    typeof value.topicSlug === 'string' &&
    typeof value.topicTitle === 'string' &&
    isTopicAction(value.topicAction) &&
    Array.isArray(value.sectionIds) &&
    value.sectionIds.every((entry) => typeof entry === 'string') &&
    isTaxonomyAction(value.taxonomyAction) &&
    (typeof value.taxonomySlug === 'string' || value.taxonomySlug === null) &&
    isRecord(value.taxonomy) &&
    (typeof value.taxonomy.rootTaxonomySlug === 'string' || value.taxonomy.rootTaxonomySlug === null) &&
    (typeof value.taxonomy.parentTaxonomySlug === 'string' || value.taxonomy.parentTaxonomySlug === null) &&
    (typeof value.taxonomy.leafTaxonomySlug === 'string' || value.taxonomy.leafTaxonomySlug === null) &&
    Array.isArray(value.conflictTaxonomySlugs) &&
    value.conflictTaxonomySlugs.every((entry) => typeof entry === 'string')
  );
}

function isTopicAction(value: unknown): value is TopicTaxonomyPlanEntry['topicAction'] {
  return value === 'reuse-topic' || value === 'create-topic' || value === 'conflict';
}

function isTaxonomyAction(value: unknown): value is TopicTaxonomyPlanEntry['taxonomyAction'] {
  return value === 'attach-existing' || value === 'create-taxonomy-node' || value === 'merge-into-existing' || value === 'conflict';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
