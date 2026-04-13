import { describe, expect, it } from 'vitest';

import { createRuntimeRunState } from '../../src/runtime/request-run-state.js';

describe('createRuntimeRunState', () => {
  it('aggregates tool outcomes into a single request-run snapshot', () => {
    const state = createRuntimeRunState({
      runId: 'run-runtime-001',
      userRequest: 'query the wiki and lint it',
      intent: 'mixed',
      plan: ['step 1', 'step 2', 'step 3'],
      assistantSummary: 'Finished runtime pass.',
      toolOutcomes: [
        {
          toolName: 'query_wiki',
          summary: 'answered from wiki',
          evidence: ['wiki/topics/patch-first.md'],
          touchedFiles: []
        },
        {
          toolName: 'lint_wiki',
          summary: '1 finding, 0 review candidates',
          evidence: ['wiki/topics/patch-first.md'],
          touchedFiles: ['wiki/index.md'],
          changeSet: {
            target_files: ['wiki/index.md'],
            patch_summary: 'rewrite index',
            rationale: 'keep navigation current',
            source_refs: [],
            risk_level: 'low',
            needs_review: false
          }
        }
      ]
    });

    expect(state.request_run.run_id).toBe('run-runtime-001');
    expect(state.request_run.intent).toBe('mixed');
    expect(state.request_run.evidence).toEqual(['wiki/topics/patch-first.md']);
    expect(state.request_run.touched_files).toEqual(['wiki/index.md']);
    expect(state.request_run.status).toBe('done');
    expect(state.changeset?.target_files).toEqual(['wiki/index.md']);
    expect(state.draft_markdown).toContain('query_wiki');
    expect(state.result_markdown).toContain('Finished runtime pass.');
  });

  it('marks the runtime state as needs_review when any tool outcome requires review', () => {
    const state = createRuntimeRunState({
      runId: 'run-runtime-002',
      userRequest: 'ingest the conflicting source',
      intent: 'ingest',
      plan: ['inspect', 'ingest', 'report'],
      assistantSummary: 'Queued for review.',
      toolOutcomes: [
        {
          toolName: 'ingest_source',
          summary: 'ingest requires review',
          evidence: ['raw/accepted/design.md'],
          touchedFiles: [],
          needsReview: true,
          reviewReasons: ['rewrites a core topic page'],
          changeSet: {
            target_files: ['wiki/topics/patch-first.md'],
            patch_summary: 'rewrite topic',
            rationale: 'conflicting source',
            source_refs: ['raw/accepted/design.md'],
            risk_level: 'high',
            needs_review: true
          }
        }
      ]
    });

    expect(state.request_run.status).toBe('needs_review');
    expect(state.request_run.decisions).toEqual(['ingest_source: rewrites a core topic page']);
    expect(state.changeset?.needs_review).toBe(true);
  });
});
