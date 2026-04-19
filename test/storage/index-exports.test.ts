import { describe, expect, it } from 'vitest';

import {
  buildGraphProjection,
  buildKnowledgePagePath,
  createGraphDatabasePool,
  buildGraphSchemaSql,
  buildRequestRunArtifactPaths,
  buildSourceManifestPath,
  findAcceptedSourceManifestByPath,
  findAcceptedSourceManifestCandidates,
  findIngestibleSourceManifestByPath,
  findIngestibleSourceManifestCandidates,
  isIngestibleSourceManifestStatus,
  listKnowledgePages,
  listIncomingGraphEdges,
  listKnowledgeTasks,
  listOutgoingGraphEdges,
  listRequestRunIds,
  listSourceManifests,
  loadGraphNode,
  loadChatSettings,
  loadKnowledgePage,
  loadKnowledgeTask,
  loadProjectEnv,
  loadRequestRunState,
  loadSourceManifest,
  parseProjectEnv,
  resolveGraphDatabaseUrl,
  saveGraphEdge,
  saveGraphNode,
  saveChatSettings,
  saveKnowledgePage,
  saveKnowledgeTask,
  saveProjectEnv,
  saveRequestRunState,
  saveSourceManifest,
  upsertEnvAssignment,
  upsertProjectEnvValue
} from '../../src/index.js';
import type {
  ChatSettings,
  GraphDatabaseClient,
  KnowledgeTask,
  LoadedKnowledgePage,
  RequestRunArtifactPaths,
  RequestRunState,
  SourceManifest
} from '../../src/index.js';

describe('package entry storage exports', () => {
  it('re-exports the request-run storage APIs and public types', () => {
    const paths: RequestRunArtifactPaths = buildRequestRunArtifactPaths('/tmp/llm-wiki-liiy', 'run-001');

    expect(typeof buildRequestRunArtifactPaths).toBe('function');
    expect(typeof listRequestRunIds).toBe('function');
    expect(typeof saveRequestRunState).toBe('function');
    expect(typeof loadRequestRunState).toBe('function');
    expect(paths.runDirectory).toBe('/tmp/llm-wiki-liiy/state/runs/run-001');

    const state: RequestRunState | null = null;
    expect(state).toBeNull();
  });

  it('re-exports the knowledge-page storage APIs and public types', () => {
    expect(typeof buildKnowledgePagePath).toBe('function');
    expect(typeof listKnowledgePages).toBe('function');
    expect(typeof saveKnowledgePage).toBe('function');
    expect(typeof loadKnowledgePage).toBe('function');
    expect(buildKnowledgePagePath('/tmp/llm-wiki-liiy', 'topic', 'llm-wiki')).toBe(
      '/tmp/llm-wiki-liiy/wiki/topics/llm-wiki.md'
    );

    const loaded: LoadedKnowledgePage | null = null;
    expect(loaded).toBeNull();
  });

  it('re-exports the source-manifest storage APIs and public types', () => {
    expect(typeof buildSourceManifestPath).toBe('function');
    expect(typeof findAcceptedSourceManifestByPath).toBe('function');
    expect(typeof findAcceptedSourceManifestCandidates).toBe('function');
    expect(typeof findIngestibleSourceManifestByPath).toBe('function');
    expect(typeof findIngestibleSourceManifestCandidates).toBe('function');
    expect(typeof isIngestibleSourceManifestStatus).toBe('function');
    expect(typeof listSourceManifests).toBe('function');
    expect(typeof saveSourceManifest).toBe('function');
    expect(typeof loadSourceManifest).toBe('function');
    expect(buildSourceManifestPath('/tmp/llm-wiki-liiy', 'src-001')).toBe(
      '/tmp/llm-wiki-liiy/state/artifacts/source-manifests/src-001.json'
    );

    const manifest: SourceManifest | null = null;
    expect(manifest).toBeNull();
  });

  it('re-exports the task, chat-settings, and project-env storage APIs and public types', () => {
    expect(typeof listKnowledgeTasks).toBe('function');
    expect(typeof loadKnowledgeTask).toBe('function');
    expect(typeof saveKnowledgeTask).toBe('function');
    expect(typeof loadChatSettings).toBe('function');
    expect(typeof saveChatSettings).toBe('function');
    expect(typeof loadProjectEnv).toBe('function');
    expect(typeof saveProjectEnv).toBe('function');
    expect(typeof upsertProjectEnvValue).toBe('function');
    expect(typeof parseProjectEnv).toBe('function');
    expect(typeof upsertEnvAssignment).toBe('function');

    const task: KnowledgeTask | null = null;
    const settings: ChatSettings | null = null;

    expect(task).toBeNull();
    expect(settings).toBeNull();
  });

  it('re-exports the graph storage APIs and public types', () => {
    expect(typeof resolveGraphDatabaseUrl).toBe('function');
    expect(typeof createGraphDatabasePool).toBe('function');
    expect(typeof buildGraphSchemaSql).toBe('function');
    expect(typeof saveGraphNode).toBe('function');
    expect(typeof saveGraphEdge).toBe('function');
    expect(typeof loadGraphNode).toBe('function');
    expect(typeof buildGraphProjection).toBe('function');
    expect(typeof listOutgoingGraphEdges).toBe('function');
    expect(typeof listIncomingGraphEdges).toBe('function');
    expect(buildGraphSchemaSql()).toContain('create table if not exists graph_nodes');

    const client: GraphDatabaseClient | null = null;
    expect(client).toBeNull();
  });
});
