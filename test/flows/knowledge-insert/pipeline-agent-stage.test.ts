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

  it('retries when a stage returns invalid JSON before accepting a valid object', async () => {
    const outputs = [
      'I cannot return JSON for this one.',
      JSON.stringify({
        schemaVersion: 'knowledge-insert.topic-plan.v3',
        sourceId: 'src-001',
        topics: []
      })
    ];
    const prompts: string[] = [];

    const result = await runPipelineJsonStage({
      stage: 'topics.planned',
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      inputJson: { sourceId: 'src-001' },
      exampleJson: { schemaVersion: 'knowledge-insert.topic-plan.v3', sourceId: 'src-example', topics: [] },
      generate: async (prompt) => {
        prompts.push(prompt);
        return outputs.shift() ?? '{}';
      }
    });

    expect(result.sourceId).toBe('src-001');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Previous output was invalid JSON');
  });

  it('retries when a stage returns JSON that fails schema validation', async () => {
    const outputs = [
      JSON.stringify({
        schemaVersion: 'knowledge-insert.topic-plan.v3',
        sourceId: 'src-001'
      }),
      JSON.stringify({
        schemaVersion: 'knowledge-insert.topic-plan.v3',
        sourceId: 'src-001',
        topics: []
      })
    ];
    const prompts: string[] = [];

    const result = await runPipelineJsonStage({
      stage: 'topics.planned',
      schemaVersion: 'knowledge-insert.topic-plan.v3',
      inputJson: { sourceId: 'src-001' },
      exampleJson: { schemaVersion: 'knowledge-insert.topic-plan.v3', sourceId: 'src-example', topics: [] },
      generate: async (prompt) => {
        prompts.push(prompt);
        return outputs.shift() ?? '{}';
      },
      validate: (candidate) => {
        if (!Array.isArray(candidate.topics)) {
          throw new Error('missing topics array');
        }
      }
    });

    expect(result.topics).toEqual([]);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Previous output was invalid JSON');
    expect(prompts[1]).toContain('missing topics array');
  });
});
