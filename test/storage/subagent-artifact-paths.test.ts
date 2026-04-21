import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSubagentArtifactPaths } from '../../src/storage/subagent-artifact-paths.js';

describe('buildSubagentArtifactPaths', () => {
  it('maps a subagent run id into state/artifacts/subagents', () => {
    expect(buildSubagentArtifactPaths('/tmp/llm-wiki-liiy', 'run-001--subagent-1').root).toBe(
      path.join('/tmp/llm-wiki-liiy', 'state', 'artifacts', 'subagents', 'run-001--subagent-1')
    );
  });

  it.each(['', '../other', 'nested/run-001', 'nested\\run-001', '.', '..'])(
    'rejects an unsafe run id: %s',
    (runId) => {
      expect(() => buildSubagentArtifactPaths('/tmp/llm-wiki-liiy', runId)).toThrow(
        `Invalid run id: ${runId}`
      );
    }
  );
});
