import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';

export interface SubagentArtifactPaths {
  root: string;
}

export interface ResolvedStateArtifactPath {
  artifactPath: string;
  absolutePath: string;
  projectPath: string;
}

export function buildSubagentArtifactPaths(root: string, runId: string): SubagentArtifactPaths {
  assertValidRunId(runId);

  return {
    root: path.join(buildProjectPaths(root).stateSubagents, runId)
  };
}

export function resolveStateArtifactPath(root: string, artifactPath: string): ResolvedStateArtifactPath {
  const trimmedPath = artifactPath.trim();

  if (trimmedPath.length === 0) {
    throw new Error('Artifact path is required');
  }

  const normalizedInput = trimmedPath.replaceAll('\\', '/').replace(/^\.\/+/u, '');
  const relativeArtifactPath = normalizedInput.startsWith('state/artifacts/')
    ? normalizedInput.slice('state/artifacts/'.length)
    : normalizedInput;
  const stateArtifacts = buildProjectPaths(root).stateArtifacts;
  const absolutePath = path.resolve(stateArtifacts, relativeArtifactPath);
  const relativePath = path.relative(stateArtifacts, absolutePath);

  if (relativePath.length === 0 || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Artifact path must stay within state/artifacts: ${artifactPath}`);
  }

  return {
    artifactPath: relativePath.split(path.sep).join('/'),
    absolutePath,
    projectPath: path.join('state', 'artifacts', relativePath)
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
