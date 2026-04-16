import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';
import { createWebServer } from '../../src/app/web-server.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { syncReviewTask } from '../../src/flows/review/sync-review-task.js';
import { saveRequestRunState } from '../../src/storage/request-run-state-store.js';
import { loadKnowledgeTask } from '../../src/storage/task-store.js';

interface JsonResponse<T> {
  status: number;
  body: T;
}

describe('createWebServer review actions', () => {
  it('approves a pending review and applies the stored draft payload', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-review-'));

    try {
      await bootstrapProject(root);
      const pendingRunState = {
        request_run: createRequestRun({
          run_id: 'run-review-action-001',
          user_request: 'write back a durable patch first answer',
          intent: 'mixed',
          plan: ['observe', 'draft', 'govern'],
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md'],
          touched_files: ['wiki/queries/what-is-patch-first.md'],
          decisions: ['apply_draft_upsert: durable query writeback queued for review'],
          result_summary: 'waiting for review'
        }),
        tool_outcomes: [
          {
            order: 1,
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

      const server = createWebServer(root, {
        runRuntimeAgent: async () => {
          throw new Error('runRuntimeAgent should not be called in review action test');
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const reviewBefore = await fetchJson<{ can_resolve: boolean; status: string }>(`${baseUrl}/api/reviews/run-review-action-001`);
        const approved = await fetchJson<{ ok: boolean; decision: string; status: string; touched_files: string[]; run_url: string; review_url: string }>(
          `${baseUrl}/api/reviews/run-review-action-001/decision`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ decision: 'approve', reviewer: 'editor', note: 'looks grounded' })
          }
        );
        const reviewAfter = await fetchJson<{ can_resolve: boolean; status: string; touched_files: string[] }>(`${baseUrl}/api/reviews/run-review-action-001`);

        expect(reviewBefore.body.can_resolve).toBe(true);
        expect(approved.body.ok).toBe(true);
        expect(approved.body.decision).toBe('approve');
        expect(approved.body.status).toBe('done');
        expect(approved.body.touched_files).toEqual(['wiki/queries/what-is-patch-first.md', 'wiki/index.md', 'wiki/log.md']);
        expect(approved.body.run_url).toBe('/api/runs/run-review-action-001');
        expect(reviewAfter.body.can_resolve).toBe(false);
        expect(reviewAfter.body.status).toBe('done');
        expect(reviewAfter.body.touched_files).toEqual(['wiki/queries/what-is-patch-first.md', 'wiki/index.md', 'wiki/log.md']);
        expect(await readFile(path.join(root, 'wiki', 'queries', 'what-is-patch-first.md'), 'utf8')).toContain('Patch first keeps page structure stable.');
        await expect(loadKnowledgeTask(root, 'review-run-review-action-001')).resolves.toMatchObject({ status: 'done' });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a pending review without applying wiki writes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-web-review-'));

    try {
      await bootstrapProject(root);
      const pendingRunState = {
        request_run: createRequestRun({
          run_id: 'run-review-action-002',
          user_request: 'review a risky rewrite',
          intent: 'mixed',
          plan: ['observe', 'govern'],
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md'],
          touched_files: ['wiki/topics/patch-first.md'],
          decisions: ['upsert_knowledge_page: rewrites a core topic page'],
          result_summary: 'waiting for review'
        }),
        tool_outcomes: [
          {
            order: 1,
            toolName: 'upsert_knowledge_page',
            summary: 'queued topic rewrite',
            evidence: ['wiki/topics/patch-first.md'],
            touchedFiles: [],
            needsReview: true,
            reviewReasons: ['rewrites a core topic page'],
            resultMarkdown: 'Queued for review: rewrites a core topic page'
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

      const server = createWebServer(root, {
        runRuntimeAgent: async () => {
          throw new Error('runRuntimeAgent should not be called in review action test');
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Server did not bind to a port');
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        const rejected = await fetchJson<{ ok: boolean; decision: string; status: string; touched_files: string[] }>(
          `${baseUrl}/api/reviews/run-review-action-002/decision`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ decision: 'reject', reviewer: 'editor', note: 'insufficient evidence' })
          }
        );
        const reviewAfter = await fetchJson<{ can_resolve: boolean; status: string; touched_files: string[] }>(`${baseUrl}/api/reviews/run-review-action-002`);

        expect(rejected.body.ok).toBe(true);
        expect(rejected.body.decision).toBe('reject');
        expect(rejected.body.status).toBe('rejected');
        expect(rejected.body.touched_files).toEqual([]);
        expect(reviewAfter.body.can_resolve).toBe(false);
        expect(reviewAfter.body.status).toBe('rejected');
        expect(reviewAfter.body.touched_files).toEqual([]);
        await expect(loadKnowledgeTask(root, 'review-run-review-action-002')).resolves.toMatchObject({ status: 'done' });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function fetchJson<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: (await response.json()) as T
  };
}
