import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { HostedKnowledgeSection } from './resolve-topic-hosts.js';

const parameters = Type.Object({
  hostedSectionsArtifact: Type.String({ description: 'Hosted sections artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for topic insertion plan JSON.' })
});

export type BuildTopicInsertionPlanParameters = Static<typeof parameters>;

export interface TopicInsertionPlanSection {
  sectionId: string;
  title: string;
  summary: string;
  body: string;
  action: 'append-section';
}

export interface TopicInsertionPlanTopic {
  topicSlug: string;
  action: 'revise-topic' | 'create-topic' | 'conflict';
  topicTitle?: string;
  sections: TopicInsertionPlanSection[];
  conflicts: string[];
}

export interface TopicInsertionPlanArtifact {
  topics: TopicInsertionPlanTopic[];
}

export function createBuildTopicInsertionPlanTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'build_topic_insertion_plan',
    label: 'Build Topic Insertion Plan',
    description:
      'Build a topic-centered insertion plan from hosted sections without consulting raw topic hints directly.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedInput = resolveStateArtifactPath(runtimeContext.root, params.hostedSectionsArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const hostedSections = parseHostedSections(await readFile(resolvedInput.absolutePath, 'utf8'));
      const artifact: TopicInsertionPlanArtifact = {
        topics: buildTopics(hostedSections)
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'build_topic_insertion_plan',
        summary: `built topic insertion plan for ${artifact.topics.length} topics`,
        evidence: [resolvedInput.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          topicCount: artifact.topics.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Built insertion topics: ${artifact.topics.length}`,
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

function parseHostedSections(content: string): HostedKnowledgeSection[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.sections) || !value.sections.every(isHostedKnowledgeSection)) {
    throw new Error('Invalid hosted sections artifact');
  }

  return value.sections;
}

function buildTopics(hostedSections: HostedKnowledgeSection[]): TopicInsertionPlanTopic[] {
  const topics = new Map<string, TopicInsertionPlanTopic>();

  for (const section of hostedSections) {
    const topicKey = resolveTopicKey(section);
    const action = resolveTopicAction(section);
    const existing = topics.get(topicKey);

    if (!existing) {
      topics.set(topicKey, {
        topicSlug: topicKey,
        action,
        ...(section.hostAction === 'create-topic' && section.suggestedTopicTitle
          ? { topicTitle: section.suggestedTopicTitle }
          : {}),
        sections: isAppendableSection(section) ? [toPlanSection(section)] : [],
        conflicts: action === 'conflict' ? [section.sectionId] : []
      });
      continue;
    }

    if (isAppendableSection(section)) {
      existing.sections.push(toPlanSection(section));
    } else {
      existing.conflicts.push(section.sectionId);
    }
  }

  return [...topics.values()];
}

function resolveTopicKey(section: HostedKnowledgeSection): string {
  if (section.hostAction === 'reuse-topic' && section.hostTopicSlug) {
    return section.hostTopicSlug;
  }

  if (section.hostAction === 'create-topic') {
    return section.suggestedTopicSlug ?? slugify(section.suggestedTopicTitle ?? section.title);
  }

  return `conflict-${section.sectionId}`;
}

function resolveTopicAction(section: HostedKnowledgeSection): TopicInsertionPlanTopic['action'] {
  if (section.hostAction === 'reuse-topic') {
    return 'revise-topic';
  }

  if (section.hostAction === 'create-topic') {
    return 'create-topic';
  }

  return 'conflict';
}

function isAppendableSection(section: HostedKnowledgeSection): boolean {
  return section.hostAction === 'reuse-topic' || section.hostAction === 'create-topic';
}

function toPlanSection(section: HostedKnowledgeSection): TopicInsertionPlanSection {
  return {
    sectionId: section.sectionId,
    title: section.title,
    summary: section.summary,
    body: section.body,
    action: 'append-section'
  };
}

function isHostedKnowledgeSection(value: unknown): value is HostedKnowledgeSection {
  return isRecord(value) && typeof value.sectionId === 'string' && typeof value.title === 'string' && typeof value.hostAction === 'string';
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
