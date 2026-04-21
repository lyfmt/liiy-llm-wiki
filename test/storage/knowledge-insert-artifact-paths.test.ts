import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildKnowledgeInsertArtifactPaths } from '../../src/storage/knowledge-insert-artifact-paths.js';

describe('buildKnowledgeInsertArtifactPaths', () => {
  it('maps a run id into state/artifacts/knowledge-insert', () => {
    expect(buildKnowledgeInsertArtifactPaths('/tmp/llm-wiki-liiy', 'run-001').root).toBe(
      path.join('/tmp/llm-wiki-liiy', 'state', 'artifacts', 'knowledge-insert', 'run-001')
    );
  });
});
