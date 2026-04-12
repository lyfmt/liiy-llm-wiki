import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';

export function buildSourceManifestPath(root: string, id: string): string {
  assertValidSourceManifestId(id);

  const { stateArtifacts } = buildProjectPaths(root);
  return path.join(stateArtifacts, 'source-manifests', `${id}.json`);
}

function assertValidSourceManifestId(id: string): void {
  if (
    id.length === 0 ||
    id === '.' ||
    id === '..' ||
    id !== path.basename(id) ||
    id.includes('/') ||
    id.includes('\\')
  ) {
    throw new Error(`Invalid source manifest id: ${id}`);
  }
}
