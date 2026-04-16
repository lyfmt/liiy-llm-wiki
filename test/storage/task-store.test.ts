import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgeTask } from '../../src/domain/task.js';
import { createRequestRun } from '../../src/domain/request-run.js';
import { syncReviewTask } from '../../src/flows/review/sync-review-task.js';
import { listKnowledgeTasks, loadKnowledgeTask, saveKnowledgeTask } from '../../src/storage/task-store.js';

describe('task-store', () => {
  it('saves, loads, and filters tasks by status', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-task-store-'));

    try {
      const pendingTask = createKnowledgeTask({
        id: 'task-001',
        title: 'Review patch-first topic',
        status: 'pending',
        evidence: ['wiki/topics/patch-first.md'],
        created_at: '2026-04-13T00:00:00.000Z'
      });
      const doneTask = createKnowledgeTask({
        id: 'task-002',
        title: 'Refresh stale page',
        status: 'done',
        evidence: ['wiki/topics/stale.md'],
        created_at: '2026-04-13T00:00:00.000Z'
      });

      const filePath = await saveKnowledgeTask(root, pendingTask);
      await saveKnowledgeTask(root, doneTask);

      expect(filePath).toBe(path.join(root, 'state', 'artifacts', 'tasks', 'task-001.json'));
      expect(await loadKnowledgeTask(root, 'task-001')).toEqual(pendingTask);
      expect((await listKnowledgeTasks(root)).map((task) => task.id)).toEqual(['task-001', 'task-002']);
      expect((await listKnowledgeTasks(root, 'done')).map((task) => task.id)).toEqual(['task-002']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed stored task records', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-task-store-'));
    const taskPath = path.join(root, 'state', 'artifacts', 'tasks', 'task-001.json');

    try {
      await mkdir(path.dirname(taskPath), { recursive: true });
      await writeFile(taskPath, '{"id":123}\n', 'utf8');

      await expect(loadKnowledgeTask(root, 'task-001')).rejects.toThrow('Invalid task state: invalid task-001.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes JSON task payloads to disk', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-task-store-'));

    try {
      const task = createKnowledgeTask({
        id: 'task-003',
        title: 'Investigate missing links',
        description: 'Check orphan and missing-link reports.',
        status: 'needs_review',
        created_at: '2026-04-13T00:00:00.000Z'
      });

      const filePath = await saveKnowledgeTask(root, task);
      const raw = await readFile(filePath, 'utf8');

      expect(raw).toContain('"title": "Investigate missing links"');
      expect(raw).toContain('"status": "needs_review"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('syncs review tasks from run state and marks them done after resolution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-task-store-'));

    try {
      const needsReviewState = {
        request_run: createRequestRun({
          run_id: 'run-review-task-001',
          user_request: 'save a durable answer',
          intent: 'mixed',
          plan: ['observe', 'draft', 'govern'],
          status: 'needs_review',
          evidence: ['wiki/topics/patch-first.md'],
          touched_files: [],
          decisions: ['queue review gate: durable query writeback queued for review'],
          result_summary: 'waiting for review'
        }),
        tool_outcomes: [],
        draft_markdown: '# Draft\n',
        result_markdown: '# Result\n',
        changeset: {
          target_files: ['wiki/queries/patch-first.md'],
          patch_summary: 'persist query answer',
          rationale: 'capture durable answer',
          source_refs: ['raw/accepted/design.md'],
          risk_level: 'medium',
          needs_review: true
        }
      };

      const pendingTask = await syncReviewTask(root, needsReviewState);

      expect(pendingTask).toMatchObject({
        id: 'review-run-review-task-001',
        status: 'needs_review',
        assignee: 'operator',
        evidence: ['wiki/topics/patch-first.md', 'raw/accepted/design.md', 'wiki/queries/patch-first.md']
      });

      const resolvedTask = await syncReviewTask(root, {
        ...needsReviewState,
        request_run: {
          ...needsReviewState.request_run,
          status: 'done',
          result_summary: 'review approved and applied'
        },
        changeset: {
          ...needsReviewState.changeset,
          needs_review: false
        }
      });

      expect(resolvedTask).toMatchObject({
        id: 'review-run-review-task-001',
        status: 'done',
        assignee: 'operator'
      });
      expect(await loadKnowledgeTask(root, 'review-run-review-task-001')).toMatchObject({
        id: 'review-run-review-task-001',
        status: 'done'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
