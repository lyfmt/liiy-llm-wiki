import { describe, expect, it } from 'vitest';

import {
  buildKnowledgePagePath,
  buildRequestRunArtifactPaths,
  buildSourceManifestPath,
  findAcceptedSourceManifestByPath,
  listKnowledgePages,
  loadKnowledgePage,
  loadRequestRunState,
  loadSourceManifest,
  saveKnowledgePage,
  saveRequestRunState,
  saveSourceManifest
} from '../../src/index.js';
import type {
  LoadedKnowledgePage,
  RequestRunArtifactPaths,
  RequestRunState,
  SourceManifest
} from '../../src/index.js';

describe('package entry storage exports', () => {
  it('re-exports the request-run storage APIs and public types', () => {
    const paths: RequestRunArtifactPaths = buildRequestRunArtifactPaths('/tmp/llm-wiki-liiy', 'run-001');

    expect(typeof buildRequestRunArtifactPaths).toBe('function');
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
    expect(typeof saveSourceManifest).toBe('function');
    expect(typeof loadSourceManifest).toBe('function');
    expect(buildSourceManifestPath('/tmp/llm-wiki-liiy', 'src-001')).toBe(
      '/tmp/llm-wiki-liiy/state/artifacts/source-manifests/src-001.json'
    );

    const manifest: SourceManifest | null = null;
    expect(manifest).toBeNull();
  });
});
