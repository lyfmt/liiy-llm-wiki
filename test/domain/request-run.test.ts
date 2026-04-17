import { describe, expect, it } from 'vitest';

import { createRequestRun } from '../../src/domain/request-run.js';

describe('createRequestRun', () => {
  it('creates a request run with default running status and empty collections', () => {
    const run = createRequestRun({
      run_id: 'run-001',
      user_request: 'ingest this source',
      intent: 'ingest',
      plan: ['read raw source', 'update wiki']
    });

    expect(run).toEqual({
      run_id: 'run-001',
      session_id: null,
      user_request: 'ingest this source',
      intent: 'ingest',
      plan: ['read raw source', 'update wiki'],
      status: 'running',
      evidence: [],
      touched_files: [],
      decisions: [],
      result_summary: ''
    });
  });

  it('preserves explicit review status and populated collections', () => {
    const run = createRequestRun({
      run_id: 'run-002',
      user_request: 'answer this question',
      intent: 'query',
      plan: ['read wiki', 'draft answer'],
      status: 'needs_review',
      evidence: ['wiki/topics/llm-wiki.md'],
      touched_files: ['wiki/queries/example.md'],
      decisions: ['write back high-value result'],
      result_summary: 'needs user review'
    });

    expect(run.status).toBe('needs_review');
    expect(run.evidence).toEqual(['wiki/topics/llm-wiki.md']);
    expect(run.touched_files).toEqual(['wiki/queries/example.md']);
    expect(run.decisions).toEqual(['write back high-value result']);
    expect(run.result_summary).toBe('needs user review');
  });

  it('supports rejected review runs as a persisted terminal state', () => {
    const run = createRequestRun({
      run_id: 'run-002b',
      user_request: 'review this changeset',
      intent: 'query',
      plan: ['inspect review'],
      status: 'rejected',
      result_summary: 'review rejected'
    });

    expect(run.status).toBe('rejected');
    expect(run.result_summary).toBe('review rejected');
  });

  it('does not mutate the created run when caller-owned arrays change later', () => {
    const plan = ['read wiki'];
    const evidence = ['wiki/topics/llm-wiki.md'];
    const touchedFiles = ['wiki/queries/example.md'];
    const decisions = ['write back high-value result'];
    const run = createRequestRun({
      run_id: 'run-003',
      user_request: 'answer this question',
      intent: 'query',
      plan,
      evidence,
      touched_files: touchedFiles,
      decisions
    });

    plan.push('draft answer');
    evidence.push('wiki/entities/example.md');
    touchedFiles.push('wiki/topics/new-topic.md');
    decisions.push('queue review');

    expect(run.plan).toEqual(['read wiki']);
    expect(run.evidence).toEqual(['wiki/topics/llm-wiki.md']);
    expect(run.touched_files).toEqual(['wiki/queries/example.md']);
    expect(run.decisions).toEqual(['write back high-value result']);
  });
});
