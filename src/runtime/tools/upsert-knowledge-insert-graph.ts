import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import {
  createKnowledgeInsertGraphWrite,
  type KnowledgeInsertMergedKnowledgeArtifact,
  type KnowledgeInsertPreparedResourceArtifact,
  type KnowledgeInsertSectionsArtifact,
  type KnowledgeInsertTopicDraftArtifact,
  type KnowledgeInsertTopicTaxonomyArtifact
} from '../../domain/knowledge-insert-graph-write.js';
import { getSharedGraphDatabasePool, resolveGraphDatabaseUrl } from '../../storage/graph-database.js';
import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import { loadProjectEnv } from '../../storage/project-env-store.js';
import { saveKnowledgeInsertGraphWrite } from '../../storage/save-knowledge-insert-graph-write.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  topicTaxonomyArtifact: Type.String({ description: 'Topic taxonomy planning artifact under state/artifacts/.' }),
  topicDraftsArtifact: Type.String({ description: 'Deterministic topic drafts artifact under state/artifacts/.' }),
  sectionsArtifact: Type.String({ description: 'Normalized sections artifact under state/artifacts/.' }),
  mergedKnowledgeArtifact: Type.String({ description: 'Merged extracted knowledge artifact under state/artifacts/.' }),
  preparedResourceArtifact: Type.String({ description: 'Prepared source resource artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for the normalized graph write JSON.' })
});

export type UpsertKnowledgeInsertGraphParameters = Static<typeof parameters>;

export function createUpsertKnowledgeInsertGraphTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'upsert_knowledge_insert_graph',
    label: 'Upsert Knowledge Insert Graph',
    description:
      'Normalize deterministic knowledge-insert artifacts into a full graph write set, persist the graph, and emit the graph write artifact for downstream verification.',
    parameters,
    execute: async (_toolCallId, params) => {
      const topicTaxonomyArtifact = parseJsonArtifact<KnowledgeInsertTopicTaxonomyArtifact>(
        await readArtifact(runtimeContext.root, params.topicTaxonomyArtifact),
        'Invalid topic taxonomy artifact'
      );
      const topicDraftsArtifact = parseJsonArtifact<KnowledgeInsertTopicDraftArtifact>(
        await readArtifact(runtimeContext.root, params.topicDraftsArtifact),
        'Invalid topic drafts artifact'
      );
      const sectionsArtifact = parseJsonArtifact<KnowledgeInsertSectionsArtifact>(
        await readArtifact(runtimeContext.root, params.sectionsArtifact),
        'Invalid sections artifact'
      );
      const mergedKnowledgeArtifact = parseJsonArtifact<KnowledgeInsertMergedKnowledgeArtifact>(
        await readArtifact(runtimeContext.root, params.mergedKnowledgeArtifact),
        'Invalid merged knowledge artifact'
      );
      const preparedResourceArtifact = parseJsonArtifact<KnowledgeInsertPreparedResourceArtifact>(
        await readArtifact(runtimeContext.root, params.preparedResourceArtifact),
        'Invalid prepared resource artifact'
      );
      const graphWrite = createKnowledgeInsertGraphWrite({
        topicTaxonomyArtifact,
        topicDraftsArtifact,
        sectionsArtifact,
        mergedKnowledgeArtifact,
        preparedResourceArtifact
      });
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(graphWrite, null, 2)}\n`, 'utf8');

      const projectEnv = await loadProjectEnv(runtimeContext.root);
      const databaseUrl = resolveGraphDatabaseUrl(projectEnv.contents);
      const client = getSharedGraphDatabasePool(databaseUrl);
      await saveKnowledgeInsertGraphWrite(client, graphWrite);

      const outcome: RuntimeToolOutcome = {
        toolName: 'upsert_knowledge_insert_graph',
        summary: `upserted knowledge-insert graph write with ${graphWrite.nodes.length} nodes and ${graphWrite.edges.length} edges`,
        evidence: [resolvedOutput.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          sourceId: graphWrite.sourceId,
          topicIds: graphWrite.topicIds,
          nodeCount: graphWrite.nodes.length,
          edgeCount: graphWrite.edges.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Persisted knowledge-insert graph for ${graphWrite.sourceId}`,
          `Topics: ${graphWrite.topicIds.join(', ') || '_none_'}`,
          `Nodes: ${graphWrite.nodes.length}`,
          `Edges: ${graphWrite.edges.length}`,
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

async function readArtifact(root: string, artifactPath: string): Promise<string> {
  const resolved = resolveStateArtifactPath(root, artifactPath);
  return readFile(resolved.absolutePath, 'utf8');
}

function parseJsonArtifact<T>(content: string, errorMessage: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(errorMessage);
  }
}
