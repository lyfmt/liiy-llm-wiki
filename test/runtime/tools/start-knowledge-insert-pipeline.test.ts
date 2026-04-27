import { describe, expect, it } from 'vitest';

import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createStartKnowledgeInsertPipelineTool } from '../../../src/runtime/tools/start-knowledge-insert-pipeline.js';

describe('createStartKnowledgeInsertPipelineTool', () => {
  it('starts the pg-primary pipeline for a chat attachment and returns run info only', async () => {
    const runtimeContext = createRuntimeContext({
      root: '/project',
      runId: 'run-001',
      sessionId: 'session-001'
    });
    const tool = createStartKnowledgeInsertPipelineTool(runtimeContext, {
      startFromAttachment: async (input) => ({
        runId: 'pipeline-run-001',
        sourceId: `src-${input.attachmentId}`,
        status: 'running',
        artifactsRoot: 'state/artifacts/knowledge-insert-pipeline/pipeline-run-001'
      })
    });

    const result = await tool.execute('tool-call-1', {
      attachmentId: 'attachment-a'
    });

    expect(result.details.toolName).toBe('start_knowledge_insert_pipeline');
    expect(result.details.summary).toContain('pipeline-run-001');
    expect(result.details.data).toEqual(expect.objectContaining({
      runId: 'pipeline-run-001',
      sourceId: 'src-attachment-a',
      status: 'running'
    }));
  });
});
