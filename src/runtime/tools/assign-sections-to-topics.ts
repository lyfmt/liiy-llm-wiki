import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { NormalizedKnowledgeSection } from './merge-section-candidates.js';
import type { HostedKnowledgeSection } from './resolve-topic-hosts.js';
import type { SourceTopicPlanEntry } from './resolve-source-topics.js';

const parameters = Type.Object({
  sourceTopicsArtifact: Type.String({ description: 'Source topic planning artifact under state/artifacts/.' }),
  sectionsArtifact: Type.String({ description: 'Normalized sections artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for attached hosted sections JSON.' })
});

export type AssignSectionsToTopicsParameters = Static<typeof parameters>;

export interface AttachedKnowledgeSection extends HostedKnowledgeSection {
  sourceTopicId: string;
}

export interface AssignedSectionsArtifact {
  sections: AttachedKnowledgeSection[];
}

export function createAssignSectionsToTopicsTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'assign_sections_to_topics',
    label: 'Assign Sections To Topics',
    description:
      'Attach normalized sections to precomputed source topic decisions and emit a hosted-sections style artifact for downstream consumers.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedSourceTopics = resolveStateArtifactPath(runtimeContext.root, params.sourceTopicsArtifact);
      const resolvedSections = resolveStateArtifactPath(runtimeContext.root, params.sectionsArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const sourceTopics = parseSourceTopics(await readFile(resolvedSourceTopics.absolutePath, 'utf8'));
      const sections = parseSections(await readFile(resolvedSections.absolutePath, 'utf8'));
      const artifact: AssignedSectionsArtifact = {
        sections: assignSectionsToTopics(sections, sourceTopics)
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'assign_sections_to_topics',
        summary: `assigned ${sections.length} sections to ${sourceTopics.length} source topics`,
        evidence: [resolvedSourceTopics.absolutePath, resolvedSections.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          sectionCount: sections.length,
          sourceTopicCount: sourceTopics.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Assigned sections: ${sections.length}`,
          `Source topics: ${sourceTopics.length}`,
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

function assignSectionsToTopics(
  sections: NormalizedKnowledgeSection[],
  sourceTopics: SourceTopicPlanEntry[]
): AttachedKnowledgeSection[] {
  const sectionToSourceTopic = new Map<string, SourceTopicPlanEntry>();

  for (const sourceTopic of sourceTopics) {
    for (const sectionId of sourceTopic.sectionIds) {
      if (sectionToSourceTopic.has(sectionId)) {
        throw new Error(`Section ${sectionId} is assigned to multiple source topics`);
      }

      sectionToSourceTopic.set(sectionId, sourceTopic);
    }
  }

  return sections.map((section) => {
    const sourceTopic = sectionToSourceTopic.get(section.sectionId);

    if (!sourceTopic) {
      throw new Error(`Section ${section.sectionId} is missing a source topic assignment`);
    }

    return attachSection(section, sourceTopic);
  });
}

function attachSection(
  section: NormalizedKnowledgeSection,
  sourceTopic: SourceTopicPlanEntry
): AttachedKnowledgeSection {
  if (sourceTopic.decision === 'reuse-topic') {
    return {
      ...section,
      sourceTopicId: sourceTopic.sourceTopicId,
      hostAction: 'reuse-topic',
      hostTopicSlug: sourceTopic.topicSlug
    };
  }

  if (sourceTopic.decision === 'create-topic') {
    return {
      ...section,
      sourceTopicId: sourceTopic.sourceTopicId,
      hostAction: 'create-topic',
      suggestedTopicSlug: sourceTopic.topicSlug,
      suggestedTopicTitle: sourceTopic.topicTitle
    };
  }

  if (sourceTopic.decision === 'conflict') {
    return {
      ...section,
      sourceTopicId: sourceTopic.sourceTopicId,
      hostAction: 'conflict',
      suggestedTopicSlug: sourceTopic.topicSlug,
      suggestedTopicTitle: sourceTopic.topicTitle
    };
  }

  throw new Error(`Invalid source topic decision: ${String(sourceTopic.decision)}`);
}

function parseSourceTopics(content: string): SourceTopicPlanEntry[] {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || !Array.isArray(value.sourceTopics) || !value.sourceTopics.every(isSourceTopicPlanEntry)) {
    throw new Error('Invalid source topics artifact');
  }

  return value.sourceTopics;
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

function isSourceTopicDecision(value: unknown): value is SourceTopicPlanEntry['decision'] {
  return value === 'reuse-topic' || value === 'create-topic' || value === 'conflict';
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
