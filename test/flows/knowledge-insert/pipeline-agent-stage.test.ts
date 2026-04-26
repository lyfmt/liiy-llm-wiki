import { describe, expect, it } from 'vitest';

import { runPipelineJsonStage } from '../../../src/flows/knowledge-insert/pipeline-agent-stage.js';

describe('runPipelineJsonStage', () => {
  it('passes stage input, schema, and example to a restricted generator', async () => {
    const seenPrompts: string[] = [];
    const output = await runPipelineJsonStage({
      stage: 'topics.planned',
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      inputJson: { sourceId: 'src-001', markdown: '# A' },
      exampleJson: { schemaVersion: 'knowledge-insert.topic-plan.v3', sourceId: 'src-example', topics: [] },
      generate: async (prompt) => {
        seenPrompts.push(prompt);
        return JSON.stringify({
          schemaVersion: 'knowledge-insert.topic-plan.v3',
          sourceId: 'src-001',
          topics: [{ topicId: 'topic-a', slug: 'topic-a', title: 'Topic A', scope: 'Scope', rationale: 'Because' }]
        });
      }
    });

    expect(output.sourceId).toBe('src-001');
    expect(seenPrompts[0]).toContain('Do not call tools');
    expect(seenPrompts[0]).toContain('Example JSON');
  });

  it('rejects non-json stage output', async () => {
    await expect(runPipelineJsonStage({
      stage: 'topics.planned',
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      inputJson: {},
      exampleJson: {},
      generate: async () => 'not json'
    })).rejects.toThrow('Pipeline stage did not return valid JSON');
  });
});
