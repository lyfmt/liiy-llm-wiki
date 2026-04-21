import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';

export interface KnowledgeInsertArtifactPaths {
  root: string;
  resource: string;
  blocks: string;
  mergedCandidates: string;
  coverage: string;
}

export function buildKnowledgeInsertArtifactPaths(root: string, runId: string): KnowledgeInsertArtifactPaths {
  assertValidRunId(runId);

  const knowledgeInsertRoot = path.join(buildProjectPaths(root).stateArtifacts, 'knowledge-insert', runId);

  return {
    root: knowledgeInsertRoot,
    resource: path.join(knowledgeInsertRoot, 'resource.json'),
    blocks: path.join(knowledgeInsertRoot, 'blocks.json'),
    mergedCandidates: path.join(knowledgeInsertRoot, 'merged-candidates.json'),
    coverage: path.join(knowledgeInsertRoot, 'coverage.json')
  };
}

function assertValidRunId(runId: string): void {
  if (
    runId.length === 0 ||
    runId === '.' ||
    runId === '..' ||
    runId !== path.basename(runId) ||
    runId.includes('/') ||
    runId.includes('\\')
  ) {
    throw new Error(`Invalid run id: ${runId}`);
  }
}
