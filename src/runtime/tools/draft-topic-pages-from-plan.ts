import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { renderTopicDraftsFromPlan, type ExistingTopicPagesArtifact } from '../../flows/wiki/render-topic-drafts-from-plan.js';
import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { TopicCatalogArtifact } from './build-topic-catalog.js';
import type { TopicInsertionPlanArtifact } from './build-topic-insertion-plan.js';
import type { MergedExtractedKnowledgeArtifact } from './merge-extracted-knowledge.js';
import type { MergedSectionCandidatesArtifact } from './merge-section-candidates.js';
import type { PreparedSourceResourceArtifact } from './prepare-source-resource.js';

const parameters = Type.Object({
  topicInsertionPlanArtifact: Type.String({ description: 'Topic insertion plan artifact under state/artifacts/.' }),
  topicCatalogArtifact: Type.String({ description: 'Topic catalog artifact under state/artifacts/.' }),
  existingTopicPagesArtifact: Type.Optional(
    Type.String({ description: 'Optional existing topic baseline artifact under state/artifacts/.' })
  ),
  sectionsArtifact: Type.String({ description: 'Normalized sections artifact under state/artifacts/.' }),
  mergedKnowledgeArtifact: Type.String({ description: 'Merged extracted knowledge artifact under state/artifacts/.' }),
  preparedResourceArtifact: Type.String({ description: 'Prepared source resource artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for rendered topic drafts JSON.' })
});

export type DraftTopicPagesFromPlanParameters = Static<typeof parameters>;

export function createDraftTopicPagesFromPlanTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'draft_topic_pages_from_plan',
    label: 'Draft Topic Pages From Plan',
    description:
      'Render deterministic topic page drafts from insertion plan, topic catalog, optional existing topic baselines, section, merged knowledge, and prepared resource artifacts.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedPlan = resolveStateArtifactPath(runtimeContext.root, params.topicInsertionPlanArtifact);
      const resolvedTopicCatalog = resolveStateArtifactPath(runtimeContext.root, params.topicCatalogArtifact);
      const resolvedExistingTopicPages = params.existingTopicPagesArtifact
        ? resolveStateArtifactPath(runtimeContext.root, params.existingTopicPagesArtifact)
        : null;
      const resolvedSections = resolveStateArtifactPath(runtimeContext.root, params.sectionsArtifact);
      const resolvedMergedKnowledge = resolveStateArtifactPath(runtimeContext.root, params.mergedKnowledgeArtifact);
      const resolvedPreparedResource = resolveStateArtifactPath(runtimeContext.root, params.preparedResourceArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const topicInsertionPlan = parseTopicInsertionPlan(await readFile(resolvedPlan.absolutePath, 'utf8'));
      const topicCatalog = parseTopicCatalogArtifact(await readFile(resolvedTopicCatalog.absolutePath, 'utf8'));
      const existingTopicPages = resolvedExistingTopicPages
        ? parseExistingTopicPagesArtifact(await readFile(resolvedExistingTopicPages.absolutePath, 'utf8'))
        : undefined;
      const sections = parseSectionsArtifact(await readFile(resolvedSections.absolutePath, 'utf8'));
      const mergedKnowledge = parseMergedKnowledgeArtifact(await readFile(resolvedMergedKnowledge.absolutePath, 'utf8'));
      const preparedResource = parsePreparedResourceArtifact(await readFile(resolvedPreparedResource.absolutePath, 'utf8'));
      const drafts = renderTopicDraftsFromPlan({
        topicInsertionPlan,
        topicCatalog,
        existingTopicPages,
        sections,
        mergedKnowledge,
        preparedResource
      });

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(drafts, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'draft_topic_pages_from_plan',
        summary: `drafted ${drafts.topics.length} topic page${drafts.topics.length === 1 ? '' : 's'} from insertion plan`,
        evidence: [
          resolvedPlan.absolutePath,
          resolvedTopicCatalog.absolutePath,
          ...(resolvedExistingTopicPages ? [resolvedExistingTopicPages.absolutePath] : []),
          resolvedSections.absolutePath,
          resolvedMergedKnowledge.absolutePath,
          resolvedPreparedResource.absolutePath
        ],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          topicCount: drafts.topics.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath,
          drafts
        },
        resultMarkdown: [
          `Drafted topic pages: ${drafts.topics.length}`,
          `Artifact: ${resolvedOutput.projectPath}`,
          ...drafts.topics.map((topic) => `- ${topic.targetPath}`)
        ].join('\n')
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}

function parseTopicInsertionPlan(content: string): TopicInsertionPlanArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.topics) || !value.topics.every(isTopicInsertionPlanTopicRecord)) {
    throw new Error('Invalid topic insertion plan artifact');
  }

  return value as unknown as TopicInsertionPlanArtifact;
}

function parseTopicCatalogArtifact(content: string): TopicCatalogArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.topics)) {
    throw new Error('Invalid topic catalog artifact');
  }

  return value as unknown as TopicCatalogArtifact;
}

function parseExistingTopicPagesArtifact(content: string): ExistingTopicPagesArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.topics) || !value.topics.every(isExistingTopicPageRecord)) {
    throw new Error('Invalid existing topic pages artifact');
  }

  return value as unknown as ExistingTopicPagesArtifact;
}

function parseSectionsArtifact(content: string): MergedSectionCandidatesArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.sections)) {
    throw new Error('Invalid sections artifact');
  }

  return value as unknown as MergedSectionCandidatesArtifact;
}

function parseMergedKnowledgeArtifact(content: string): MergedExtractedKnowledgeArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.assertions) || !Array.isArray(value.evidenceAnchors)) {
    throw new Error('Invalid merged knowledge artifact');
  }

  return value as unknown as MergedExtractedKnowledgeArtifact;
}

function parsePreparedResourceArtifact(content: string): PreparedSourceResourceArtifact {
  const value = JSON.parse(content) as unknown;

  if (
    !isRecord(value) ||
    typeof value.rawPath !== 'string' ||
    !Array.isArray(value.sections) ||
    !isRecord(value.metadata) ||
    !hasStablePreparedResourceTimestamp(value.metadata)
  ) {
    throw new Error('Invalid prepared resource artifact');
  }

  return value as unknown as PreparedSourceResourceArtifact;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTopicInsertionPlanTopicRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.topicSlug === 'string' && Array.isArray(value.sections);
}

function isExistingTopicPageRecord(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isNonEmptyString(value.topicSlug) &&
    isNonEmptyString(value.title) &&
    typeof value.summary === 'string' &&
    isStringArray(value.source_refs) &&
    isStringArray(value.outgoing_links) &&
    isNonEmptyString(value.status) &&
    isNonEmptyString(value.body)
  );
}

function hasStablePreparedResourceTimestamp(metadata: Record<string, unknown>): boolean {
  return isNonEmptyString(metadata.preparedAt) || isNonEmptyString(metadata.importedAt);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
