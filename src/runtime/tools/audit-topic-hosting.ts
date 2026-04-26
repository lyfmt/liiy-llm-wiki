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
  outputArtifact: Type.String({ description: 'Artifact path for topic host audit JSON.' }),
  topicInsertionPlanArtifact: Type.Optional(Type.String({ description: 'Optional insertion plan artifact to cross-check.' }))
});

export type AuditTopicHostingParameters = Static<typeof parameters>;

export interface TopicHostingAuditArtifact {
  status: 'passed' | 'failed';
  hosting: {
    unhostedSectionIds: string[];
    planUnhostedSectionIds: string[];
    canBuildInsertionPlan: boolean;
  };
}

export function createAuditTopicHostingTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'audit_topic_hosting',
    label: 'Audit Topic Hosting',
    description:
      'Audit hosted sections before insertion planning and fail when any section still lacks an explicit topic host.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedSections = resolveStateArtifactPath(runtimeContext.root, params.hostedSectionsArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const sections = parseHostedSections(await readFile(resolvedSections.absolutePath, 'utf8'));
      const unhostedSectionIds = sections.filter((section) => !hasExplicitHost(section)).map((section) => section.sectionId);
      const planUnhostedSectionIds = params.topicInsertionPlanArtifact
        ? await findPlanUnhostedSectionIds(runtimeContext.root, params.topicInsertionPlanArtifact)
        : [];
      const audit: TopicHostingAuditArtifact = {
        status: unhostedSectionIds.length === 0 && planUnhostedSectionIds.length === 0 ? 'passed' : 'failed',
        hosting: {
          unhostedSectionIds,
          planUnhostedSectionIds,
          canBuildInsertionPlan: unhostedSectionIds.length === 0 && planUnhostedSectionIds.length === 0
        }
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'audit_topic_hosting',
        summary: audit.status === 'passed' ? 'topic host audit passed' : 'topic host audit failed',
        evidence: [resolvedSections.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: audit as unknown as Record<string, unknown>,
        resultMarkdown: [
          `Topic host status: ${audit.status}`,
          `Unhosted sections: ${audit.hosting.unhostedSectionIds.join(', ') || '_none_'}`,
          `Plan unhosted sections: ${audit.hosting.planUnhostedSectionIds.join(', ') || '_none_'}`,
          `Can build insertion plan: ${String(audit.hosting.canBuildInsertionPlan)}`,
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

async function findPlanUnhostedSectionIds(root: string, artifactPath: string): Promise<string[]> {
  const resolvedPlan = resolveStateArtifactPath(root, artifactPath);
  const value = JSON.parse(await readFile(resolvedPlan.absolutePath, 'utf8')) as unknown;

  if (!isRecord(value) || !Array.isArray(value.topics)) {
    throw new Error('Invalid topic insertion plan artifact');
  }

  const sectionIds: string[] = [];

  for (const topic of value.topics) {
    if (!isRecord(topic) || !Array.isArray(topic.sections)) {
      throw new Error('Invalid topic insertion plan artifact');
    }

    for (const section of topic.sections) {
      if (!isRecord(section) || typeof section.sectionId !== 'string' || typeof section.action !== 'string') {
        throw new Error('Invalid topic insertion plan artifact');
      }

      if (section.action === 'unhosted') {
        sectionIds.push(section.sectionId);
      }
    }
  }

  return sectionIds;
}

function hasExplicitHost(section: HostedKnowledgeSection): boolean {
  if (section.hostAction === 'reuse-topic') {
    return typeof section.hostTopicSlug === 'string' && section.hostTopicSlug.length > 0;
  }

  if (section.hostAction === 'create-topic') {
    return typeof section.suggestedTopicTitle === 'string' && section.suggestedTopicTitle.length > 0;
  }

  return false;
}

function isHostedKnowledgeSection(value: unknown): value is HostedKnowledgeSection {
  return isRecord(value) && typeof value.sectionId === 'string' && typeof value.title === 'string' && typeof value.hostAction === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
