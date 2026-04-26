import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';
import { loadKnowledgePageMetadata } from '../../storage/knowledge-page-store.js';
import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { RuntimeContext } from '../runtime-context.js';

const parameters = Type.Object({
  outputArtifact: Type.String({ description: 'Artifact path for topic catalog JSON.' })
});

export type BuildTopicCatalogParameters = Static<typeof parameters>;

export interface BuiltTopicCatalogEntry {
  topicSlug: string;
  title: string;
  aliases: string[];
  summary: string;
  source_refs: string[];
}

export interface TopicCatalogArtifact {
  topics: BuiltTopicCatalogEntry[];
}

export function createBuildTopicCatalogTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'build_topic_catalog',
    label: 'Build Topic Catalog',
    description:
      'Build a topic catalog artifact from durable wiki topic pages so downstream tools can reuse current topic hosts.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const topicSlugs = await listKnowledgePages(runtimeContext.root, 'topic');
      const topics = await Promise.all(
        topicSlugs.map(async (topicSlug) => {
          const page = await loadKnowledgePageMetadata(runtimeContext.root, 'topic', topicSlug);

          return {
            topicSlug,
            title: page.title,
            aliases: page.aliases,
            summary: page.summary,
            source_refs: page.source_refs
          } satisfies BuiltTopicCatalogEntry;
        })
      );
      const artifact: TopicCatalogArtifact = { topics };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'build_topic_catalog',
        summary: `built topic catalog for ${topics.length} topics`,
        evidence: topics.map((topic) => `wiki/topics/${topic.topicSlug}.md`),
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          topicCount: topics.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [`Built topic catalog entries: ${topics.length}`, `Artifact: ${resolvedOutput.projectPath}`].join('\n')
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}
