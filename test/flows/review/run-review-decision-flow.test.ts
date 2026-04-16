import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { runReviewDecisionFlow } from '../../../src/flows/review/run-review-decision-flow.js';
import { syncReviewTask } from '../../../src/flows/review/sync-review-task.js';
import { createRequestRun } from '../../../src/domain/request-run.js';
import { saveRequestRunState } from '../../../src/storage/request-run-state-store.js';
import { loadKnowledgePage } from '../../../src/storage/knowledge-page-store.js';
import { loadKnowledgeTask } from '../../../src/storage/task-store.js';

describe('runReviewDecisionFlow', () => {
  it('approves a pending reviewed draft and applies the stored page mutation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-review-flow-'));

    try {
      await bootstrapProject(root);
      const pendingRunState = {
        request_run: createRequestRun({
          run_id: 'run-review-approve-001',
          user_request: 'write back a durable patch first answer',
          intent: 'mixed',
          plan: ['observe', 'draft', 'govern'],
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
          touched_files: ['wiki/queries/what-is-patch-first.md'],
          decisions: ['query_wiki: durable query writeback queued for review'],
          result_summary: 'waiting for review'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'draft_query_page',
            summary: 'drafted wiki/queries/what-is-patch-first.md',
            evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
            touchedFiles: [],
            resultMarkdown: '# Query Page Draft\n\n## Upsert Arguments\n{\n  "kind": "query",\n  "slug": "what-is-patch-first",\n  "title": "What Is Patch First",\n  "summary": "Durable answer for patch first",\n  "source_refs": ["raw/accepted/design.md"],\n  "outgoing_links": ["wiki/topics/patch-first.md"],\n  "status": "active",\n  "body": "# What Is Patch First\\n\\nPatch first keeps page structure stable.\\n",\n  "rationale": "capture durable answer"\n}'
          },
          {
            order: 2,
            toolName: 'apply_draft_upsert',
            summary: 'queued query page writeback',
            evidence: ['wiki/queries/what-is-patch-first.md'],
            touchedFiles: [],
            needsReview: true,
            reviewReasons: ['durable query writeback queued for review'],
            resultMarkdown: 'Draft target: wiki/queries/what-is-patch-first.md\nQueued for review: durable query writeback queued for review',
            data: {
              draft: {
                targetPath: 'wiki/queries/what-is-patch-first.md',
                upsertArguments: {
                  kind: 'query',
                  slug: 'what-is-patch-first',
                  title: 'What Is Patch First',
                  aliases: [],
                  summary: 'Durable answer for patch first',
                  tags: ['patch-first'],
                  source_refs: ['raw/accepted/design.md'],
                  outgoing_links: ['wiki/topics/patch-first.md'],
                  status: 'active',
                  body: '# What Is Patch First\n\nPatch first keeps page structure stable.\n',
                  rationale: 'capture durable answer'
                }
              }
            }
          }
        ],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: {
          target_files: ['wiki/queries/what-is-patch-first.md'],
          patch_summary: 'persist query answer',
          rationale: 'capture durable answer',
          source_refs: ['raw/accepted/design.md'],
          risk_level: 'medium',
          needs_review: true
        }
      };
      await saveRequestRunState(root, pendingRunState);
      await syncReviewTask(root, pendingRunState);

      const result = await runReviewDecisionFlow(root, {
        runId: 'run-review-approve-001',
        decision: 'approve',
        reviewer: 'editor',
        note: 'evidence looks grounded'
      });

      expect(result.decision).toBe('approve');
      expect(result.touchedFiles).toEqual(['wiki/queries/what-is-patch-first.md', 'wiki/index.md', 'wiki/log.md']);
      expect(result.runState.request_run.status).toBe('done');
      expect(result.runState.request_run.result_summary).toBe('review approved: evidence looks grounded');
      expect(result.runState.request_run.decisions).toContain('review approved by editor: evidence looks grounded');
      expect(result.runState.changeset?.needs_review).toBe(false);
      expect((await loadKnowledgePage(root, 'query', 'what-is-patch-first')).body).toContain('Patch first keeps page structure stable.');
      expect(await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')).toContain('review-approved query wiki/queries/what-is-patch-first.md');
      await expect(loadKnowledgeTask(root, 'review-run-review-approve-001')).resolves.toMatchObject({
        id: 'review-run-review-approve-001',
        status: 'done',
        assignee: 'operator'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a pending review without mutating the wiki', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-review-flow-'));

    try {
      await bootstrapProject(root);
      const pendingRunState = {
        request_run: createRequestRun({
          run_id: 'run-review-reject-001',
          user_request: 'create a risky topic rewrite',
          intent: 'mixed',
          plan: ['observe', 'draft', 'govern'],
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
          touched_files: ['wiki/topics/patch-first.md'],
          decisions: ['upsert_knowledge_page: rewrites a core topic page'],
          result_summary: 'waiting for review'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'apply_draft_upsert',
            summary: 'queued topic rewrite',
            evidence: ['wiki/topics/patch-first.md'],
            touchedFiles: [],
            needsReview: true,
            reviewReasons: ['rewrites a core topic page'],
            resultMarkdown: 'Draft target: wiki/topics/patch-first.md\nQueued for review: rewrites a core topic page'
          }
        ],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: {
          target_files: ['wiki/topics/patch-first.md'],
          patch_summary: 'rewrite topic',
          rationale: 'risky rewrite',
          source_refs: ['raw/accepted/design.md'],
          risk_level: 'high',
          needs_review: true
        }
      };
      await saveRequestRunState(root, pendingRunState);
      await syncReviewTask(root, pendingRunState);

      const result = await runReviewDecisionFlow(root, {
        runId: 'run-review-reject-001',
        decision: 'reject',
        reviewer: 'editor',
        note: 'needs better evidence'
      });

      expect(result.decision).toBe('reject');
      expect(result.touchedFiles).toEqual([]);
      expect(result.runState.request_run.status).toBe('rejected');
      expect(result.runState.request_run.result_summary).toBe('review rejected: needs better evidence');
      expect(result.runState.request_run.decisions).toContain('review rejected by editor: needs better evidence');
      expect(result.runState.changeset?.needs_review).toBe(false);
      await expect(loadKnowledgePage(root, 'topic', 'patch-first')).rejects.toThrow();
      await expect(loadKnowledgeTask(root, 'review-run-review-reject-001')).resolves.toMatchObject({
        id: 'review-run-review-reject-001',
        status: 'done',
        assignee: 'operator'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects resolving a run that is not pending review', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-review-flow-'));

    try {
      await bootstrapProject(root);
      await saveRequestRunState(root, {
        request_run: createRequestRun({
          run_id: 'run-review-done-001',
          user_request: 'already resolved',
          intent: 'query',
          plan: ['observe'],
          status: 'done',
          result_summary: 'done already'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: null
      });

      await expect(
        runReviewDecisionFlow(root, {
          runId: 'run-review-done-001',
          decision: 'approve'
        })
      ).rejects.toThrow('Review is not pending for run run-review-done-001');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
