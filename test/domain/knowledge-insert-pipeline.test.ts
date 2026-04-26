import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION,
  assertKnowledgeInsertStageName,
  createKnowledgeInsertPipelineState
} from '../../src/domain/knowledge-insert-pipeline.js';

describe('knowledge insert pipeline domain', () => {
  it('creates a durable PG-primary pipeline state', () => {
    const state = createKnowledgeInsertPipelineState({
      runId: 'run-001',
      sourceId: 'src-001',
      storageMode: 'pg-primary',
      currentStage: 'source.uploaded',
      status: 'running',
      artifacts: {}
    });

    expect(state.schemaVersion).toBe(KNOWLEDGE_INSERT_PIPELINE_SCHEMA_VERSION);
    expect(state.storageMode).toBe('pg-primary');
    expect(state.currentStage).toBe('source.uploaded');
  });

  it('rejects unknown pipeline stages', () => {
    expect(() => assertKnowledgeInsertStageName('agent.freeform')).toThrow('Invalid knowledge insert pipeline stage');
  });
});
