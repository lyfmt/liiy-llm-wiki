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
          toolName: 'draft_knowledge_page',
          summary: 'drafted wiki/topics/patch-first.md',
          evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
          touchedFiles: [],
          resultMarkdown: '# Knowledge Page Draft\n\n## Proposed Body\n# Patch First\n'
        },
        {
          toolName: 'query_wiki',
          summary: 'answered from wiki',
          evidence: ['wiki/topics/patch-first.md'],
          touchedFiles: [],
          resultMarkdown: 'Answer:\nPatch first answer\n\nSynthesis mode: llm',
          data: {
            synthesisMode: 'llm'
          }
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
    expect(state.tool_outcomes).toEqual([
      {
        order: 1,
        toolName: 'draft_knowledge_page',
        summary: 'drafted wiki/topics/patch-first.md',
        evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
        touchedFiles: [],
        resultMarkdown: '# Knowledge Page Draft\n\n## Proposed Body\n# Patch First\n'
      },
      {
        order: 2,
        toolName: 'query_wiki',
        summary: 'answered from wiki',
        evidence: ['wiki/topics/patch-first.md'],
        touchedFiles: [],
        resultMarkdown: 'Answer:\nPatch first answer\n\nSynthesis mode: llm',
        data: {
          synthesisMode: 'llm'
        }
      },
      {
        order: 3,
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
    ]);
    expect(state.request_run.evidence).toEqual(['wiki/topics/patch-first.md', 'raw/accepted/design.md']);
    expect(state.request_run.touched_files).toEqual(['wiki/index.md']);
    expect(state.request_run.status).toBe('done');
    expect(state.events).toEqual([]);
    expect(state.timeline_items).toEqual([
      {
        lane: 'user',
        title: 'User request',
        summary: 'query the wiki and lint it',
        meta: 'intent: mixed'
      },
      {
        lane: 'assistant',
        title: 'Execution plan',
        summary: '3 steps planned',
        meta: 'step 1 → step 2 → step 3'
      },
      {
        lane: 'tool',
        title: 'Latest tool outcome · lint_wiki',
        summary: '1 finding, 0 review candidates',
        meta: 'clear · files: wiki/index.md'
      },
      {
        lane: 'assistant',
        title: 'Result summary',
        summary: 'Finished runtime pass.',
        meta: 'output: result available'
      }
    ]);
    expect(state.changeset?.target_files).toEqual(['wiki/index.md']);
    expect(state.draft_markdown).toContain('## Draft Source');
    expect(state.draft_markdown).toContain('draft_knowledge_page: drafted wiki/topics/patch-first.md');
    expect(state.draft_markdown).toContain('# Knowledge Page Draft');
    expect(state.draft_markdown).toContain('## Proposed Body');
    expect(state.result_markdown).toContain('Request: query the wiki and lint it');
    expect(state.result_markdown).toContain('Status: done');
    expect(state.result_markdown).toContain('Touched files: wiki/index.md');
    expect(state.result_markdown).toContain('Evidence: wiki/topics/patch-first.md, raw/accepted/design.md');
    expect(state.result_markdown).toContain('Finished runtime pass.');
    expect(state.result_markdown).toContain('Synthesis mode: llm');
  });

  it('falls back to the generic runtime draft when no explicit page draft exists', () => {
    const state = createRuntimeRunState({
      runId: 'run-runtime-003',
      userRequest: 'query the wiki',
      intent: 'query',
      plan: ['inspect', 'query', 'report'],
      assistantSummary: 'Answered from the wiki.',
      events: [
        {
          type: 'plan_available',
          timestamp: '2026-04-15T00:00:00.000Z',
          summary: 'Plan ready',
          status: 'running'
        }
      ],
      toolOutcomes: [
        {
          toolName: 'query_wiki',
          summary: 'answered from wiki',
          evidence: ['wiki/topics/patch-first.md'],
          touchedFiles: []
        }
      ]
    });

    expect(state.tool_outcomes).toEqual([
      {
        order: 1,
        toolName: 'query_wiki',
        summary: 'answered from wiki',
        evidence: ['wiki/topics/patch-first.md'],
        touchedFiles: []
      }
    ]);
    expect(state.events).toEqual([
      {
        type: 'plan_available',
        timestamp: '2026-04-15T00:00:00.000Z',
        summary: 'Plan ready',
        status: 'running'
      }
    ]);
    expect(state.timeline_items).toEqual([
      {
        lane: 'user',
        title: 'User request',
        summary: 'query the wiki',
        meta: 'intent: query'
      },
      {
        lane: 'assistant',
        title: 'Execution plan',
        summary: '3 steps planned',
        meta: 'inspect → query → report'
      },
      {
        lane: 'system',
        title: 'Latest persisted event',
        summary: 'Plan ready',
        timestamp: '2026-04-15T00:00:00.000Z',
        meta: 'plan_available · status: running'
      },
      {
        lane: 'tool',
        title: 'Latest tool outcome · query_wiki',
        summary: 'answered from wiki',
        meta: 'clear'
      },
      {
        lane: 'assistant',
        title: 'Result summary',
        summary: 'Answered from the wiki.',
        meta: 'output: result available'
      }
    ]);
    expect(state.draft_markdown).toContain('## Plan');
    expect(state.draft_markdown).toContain('- inspect');
    expect(state.draft_markdown).toContain('## Tool Outcomes');
    expect(state.draft_markdown).toContain('- query_wiki: answered from wiki');
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
    expect(state.tool_outcomes).toEqual([
      {
        order: 1,
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
    ]);
    expect(state.request_run.decisions).toEqual(['ingest_source: rewrites a core topic page']);
    expect(state.timeline_items).toEqual([
      {
        lane: 'user',
        title: 'User request',
        summary: 'ingest the conflicting source',
        meta: 'intent: ingest'
      },
      {
        lane: 'assistant',
        title: 'Execution plan',
        summary: '3 steps planned',
        meta: 'inspect → ingest → report'
      },
      {
        lane: 'tool',
        title: 'Latest tool outcome · ingest_source',
        summary: 'ingest requires review',
        meta: 'needs review'
      },
      {
        lane: 'assistant',
        title: 'Result summary',
        summary: 'Queued for review.',
        meta: 'output: result available'
      }
    ]);
    expect(state.changeset?.target_files).toEqual(['wiki/topics/patch-first.md']);
    expect(state.changeset?.needs_review).toBe(true);
  });

  it('preserves review state for a single changeset when only the tool outcome marks review as required', () => {
    const state = createRuntimeRunState({
      runId: 'run-runtime-005',
      userRequest: 'rewrite a core topic page through a queued draft',
      intent: 'mixed',
      plan: ['observe', 'draft', 'govern'],
      assistantSummary: 'Queued for review.',
      toolOutcomes: [
        {
          toolName: 'apply_draft_upsert',
          summary: 'queued topic rewrite',
          evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
          touchedFiles: [],
          needsReview: true,
          reviewReasons: ['rewrites a core topic page'],
          changeSet: {
            target_files: ['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md'],
            patch_summary: 'rewrite topic',
            rationale: 'risky rewrite',
            source_refs: ['raw/accepted/design.md'],
            risk_level: 'high',
            needs_review: false
          }
        }
      ]
    });

    expect(state.request_run.status).toBe('needs_review');
    expect(state.request_run.decisions).toEqual(['apply_draft_upsert: rewrites a core topic page']);
    expect(state.timeline_items).toEqual([
      {
        lane: 'user',
        title: 'User request',
        summary: 'rewrite a core topic page through a queued draft',
        meta: 'intent: mixed'
      },
      {
        lane: 'assistant',
        title: 'Execution plan',
        summary: '3 steps planned',
        meta: 'observe → draft → govern'
      },
      {
        lane: 'tool',
        title: 'Latest tool outcome · apply_draft_upsert',
        summary: 'queued topic rewrite',
        meta: 'needs review'
      },
      {
        lane: 'assistant',
        title: 'Result summary',
        summary: 'Queued for review.',
        meta: 'output: result available'
      }
    ]);
    expect(state.changeset).toEqual({
      target_files: ['wiki/topics/patch-first.md', 'wiki/index.md', 'wiki/log.md'],
      patch_summary: 'rewrite topic',
      rationale: 'risky rewrite',
      source_refs: ['raw/accepted/design.md'],
      risk_level: 'high',
      needs_review: true
    });
  });

  it('marks the aggregated runtime changeset as needs_review when it touches multiple topic pages', () => {
    const state = createRuntimeRunState({
      runId: 'run-runtime-004',
      userRequest: 'update related topics together',
      intent: 'mixed',
      plan: ['inspect', 'mutate', 'govern'],
      assistantSummary: 'Queued related topic updates for review.',
      toolOutcomes: [
        {
          toolName: 'upsert_knowledge_page',
          summary: 'topic A requires review',
          evidence: ['wiki/topics/topic-a.md'],
          touchedFiles: [],
          needsReview: true,
          reviewReasons: ['rewrites a core topic page'],
          changeSet: {
            target_files: ['wiki/topics/topic-a.md'],
            patch_summary: 'rewrite topic A',
            rationale: 'related update',
            source_refs: ['raw/accepted/a.md'],
            risk_level: 'high',
            needs_review: true
          }
        },
        {
          toolName: 'upsert_knowledge_page',
          summary: 'topic B requires review',
          evidence: ['wiki/topics/topic-b.md'],
          touchedFiles: [],
          needsReview: true,
          reviewReasons: ['rewrites a core topic page'],
          changeSet: {
            target_files: ['wiki/topics/topic-b.md'],
            patch_summary: 'rewrite topic B',
            rationale: 'related update',
            source_refs: ['raw/accepted/b.md'],
            risk_level: 'high',
            needs_review: true
          }
        }
      ]
    });

    expect(state.request_run.status).toBe('needs_review');
    expect(state.tool_outcomes).toEqual([
      {
        order: 1,
        toolName: 'upsert_knowledge_page',
        summary: 'topic A requires review',
        evidence: ['wiki/topics/topic-a.md'],
        touchedFiles: [],
        needsReview: true,
        reviewReasons: ['rewrites a core topic page'],
        changeSet: {
          target_files: ['wiki/topics/topic-a.md'],
          patch_summary: 'rewrite topic A',
          rationale: 'related update',
          source_refs: ['raw/accepted/a.md'],
          risk_level: 'high',
          needs_review: true
        }
      },
      {
        order: 2,
        toolName: 'upsert_knowledge_page',
        summary: 'topic B requires review',
        evidence: ['wiki/topics/topic-b.md'],
        touchedFiles: [],
        needsReview: true,
        reviewReasons: ['rewrites a core topic page'],
        changeSet: {
          target_files: ['wiki/topics/topic-b.md'],
          patch_summary: 'rewrite topic B',
          rationale: 'related update',
          source_refs: ['raw/accepted/b.md'],
          risk_level: 'high',
          needs_review: true
        }
      }
    ]);
    expect(state.timeline_items).toEqual([
      {
        lane: 'user',
        title: 'User request',
        summary: 'update related topics together',
        meta: 'intent: mixed'
      },
      {
        lane: 'assistant',
        title: 'Execution plan',
        summary: '3 steps planned',
        meta: 'inspect → mutate → govern'
      },
      {
        lane: 'tool',
        title: 'Latest tool outcome · upsert_knowledge_page',
        summary: 'topic B requires review',
        meta: 'needs review'
      },
      {
        lane: 'assistant',
        title: 'Result summary',
        summary: 'Queued related topic updates for review.',
        meta: 'output: result available'
      }
    ]);
    expect(state.changeset?.target_files).toEqual(['wiki/topics/topic-a.md', 'wiki/topics/topic-b.md']);
    expect(state.changeset?.needs_review).toBe(true);
  });

  it('preserves explicit timeline items when provided by the caller', () => {
    const state = createRuntimeRunState({
      runId: 'run-runtime-006',
      userRequest: 'show me the canonical feed',
      intent: 'query',
      plan: ['observe', 'report'],
      assistantSummary: 'Used explicit timeline.',
      toolOutcomes: [
        {
          toolName: 'query_wiki',
          summary: 'answered from explicit feed fixture'
        }
      ],
      timelineItems: [
        {
          lane: 'system',
          title: 'Canonical feed item',
          summary: 'persisted from runtime session',
          timestamp: '2026-04-15T00:00:04.000Z',
          meta: 'fixture'
        }
      ]
    });

    expect(state.timeline_items).toEqual([
      {
        lane: 'system',
        title: 'Canonical feed item',
        summary: 'persisted from runtime session',
        timestamp: '2026-04-15T00:00:04.000Z',
        meta: 'fixture'
      }
    ]);
  });
});
