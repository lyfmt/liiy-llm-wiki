import { describe, expect, it } from 'vitest';

import { createFinding } from '../../src/domain/finding.js';

describe('createFinding', () => {
  it('creates a finding with exact spec field names', () => {
    const finding = createFinding({
      type: 'gap',
      severity: 'medium',
      evidence: ['wiki/topics/llm-wiki.md', 'raw/inbox/example.md'],
      suggested_action: 'add supporting source',
      resolution_status: 'open'
    });

    expect(finding).toEqual({
      type: 'gap',
      severity: 'medium',
      evidence: ['wiki/topics/llm-wiki.md', 'raw/inbox/example.md'],
      suggested_action: 'add supporting source',
      resolution_status: 'open'
    });
  });

  it('preserves a resolved status', () => {
    const finding = createFinding({
      type: 'missing-link',
      severity: 'low',
      evidence: ['wiki/topics/navigation.md'],
      suggested_action: 'add outgoing link',
      resolution_status: 'resolved'
    });

    expect(finding.resolution_status).toBe('resolved');
  });

  it("does not mutate the created finding when the caller's evidence array changes later", () => {
    const evidence = ['wiki/topics/llm-wiki.md'];
    const finding = createFinding({
      type: 'gap',
      severity: 'medium',
      evidence,
      suggested_action: 'add supporting source',
      resolution_status: 'open'
    });

    evidence.push('raw/inbox/example.md');

    expect(finding.evidence).toEqual(['wiki/topics/llm-wiki.md']);
  });
});
