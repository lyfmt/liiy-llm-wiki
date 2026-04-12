import { describe, expect, it } from 'vitest';

import { createChangeSet } from '../../src/domain/change-set.js';

describe('createChangeSet', () => {
  it('creates a change set with a default non-review state', () => {
    const changeSet = createChangeSet({
      target_files: ['wiki/topics/llm-wiki.md'],
      patch_summary: 'update summary section',
      rationale: 'capture the latest synthesis outcome',
      source_refs: ['raw/inbox/example.md'],
      risk_level: 'low'
    });

    expect(changeSet).toEqual({
      target_files: ['wiki/topics/llm-wiki.md'],
      patch_summary: 'update summary section',
      rationale: 'capture the latest synthesis outcome',
      source_refs: ['raw/inbox/example.md'],
      risk_level: 'low',
      needs_review: false
    });
  });

  it("does not mutate the created change set when the caller's arrays change later", () => {
    const target_files = ['wiki/topics/llm-wiki.md'];
    const source_refs = ['raw/inbox/example.md'];
    const changeSet = createChangeSet({
      target_files,
      patch_summary: 'update summary section',
      rationale: 'capture the latest synthesis outcome',
      source_refs,
      risk_level: 'low'
    });

    target_files.push('wiki/topics/agents.md');
    source_refs.push('raw/inbox/another.md');

    expect(changeSet.target_files).toEqual(['wiki/topics/llm-wiki.md']);
    expect(changeSet.source_refs).toEqual(['raw/inbox/example.md']);
  });
});
