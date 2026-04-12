import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildRequestRunArtifactPaths } from '../../src/storage/request-run-artifact-paths.js';

describe('buildRequestRunArtifactPaths', () => {
  it('builds the spec-required artifact paths under state/runs/<run_id>', () => {
    const root = '/tmp/llm-wiki-liiy';
    const runId = 'run-001';

    expect(buildRequestRunArtifactPaths(root, runId)).toEqual({
      runDirectory: path.join(root, 'state', 'runs', runId),
      request: path.join(root, 'state', 'runs', runId, 'request.json'),
      plan: path.join(root, 'state', 'runs', runId, 'plan.json'),
      evidence: path.join(root, 'state', 'runs', runId, 'evidence.json'),
      draft: path.join(root, 'state', 'runs', runId, 'draft.md'),
      changeset: path.join(root, 'state', 'runs', runId, 'changeset.json'),
      result: path.join(root, 'state', 'runs', runId, 'result.md'),
      checkpoint: path.join(root, 'state', 'runs', runId, 'checkpoint.json')
    });
  });

  it.each(['', '../other', 'nested/run-001', 'nested\\run-001', '.', '..'])(
    'rejects an unsafe run id: %s',
    (runId) => {
      expect(() => buildRequestRunArtifactPaths('/tmp/llm-wiki-liiy', runId)).toThrow(
        `Invalid run id: ${runId}`
      );
    }
  );
});
