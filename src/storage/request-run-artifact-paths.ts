import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';

export interface RequestRunArtifactPaths {
  runDirectory: string;
  request: string;
  plan: string;
  evidence: string;
  draft: string;
  changeset: string;
  result: string;
  checkpoint: string;
}

export function buildRequestRunArtifactPaths(root: string, runId: string): RequestRunArtifactPaths {
  assertValidRunId(runId);

  const { stateRuns } = buildProjectPaths(root);
  const runDirectory = path.join(stateRuns, runId);

  return {
    runDirectory,
    request: path.join(runDirectory, 'request.json'),
    plan: path.join(runDirectory, 'plan.json'),
    evidence: path.join(runDirectory, 'evidence.json'),
    draft: path.join(runDirectory, 'draft.md'),
    changeset: path.join(runDirectory, 'changeset.json'),
    result: path.join(runDirectory, 'result.md'),
    checkpoint: path.join(runDirectory, 'checkpoint.json')
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
