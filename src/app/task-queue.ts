import type { KnowledgeTask, TaskStatus } from '../domain/task.js';

export type TaskSummary = KnowledgeTask;

export interface TaskQueueSummary {
  counts: {
    total: number;
    needs_review: number;
    in_progress: number;
    pending: number;
    done: number;
  };
  review_tasks: TaskSummary[];
  manual_tasks: TaskSummary[];
}

export function buildTaskQueueSummary(tasks: TaskSummary[]): TaskQueueSummary {
  return {
    counts: {
      total: tasks.length,
      needs_review: tasks.filter((task) => task.status === 'needs_review').length,
      in_progress: tasks.filter((task) => task.status === 'in_progress').length,
      pending: tasks.filter((task) => task.status === 'pending').length,
      done: tasks.filter((task) => task.status === 'done').length
    },
    review_tasks: tasks.filter((task) => extractReviewTaskRunId(task.id) !== null),
    manual_tasks: tasks.filter((task) => extractReviewTaskRunId(task.id) === null)
  };
}

export function extractReviewTaskRunId(taskId: string): string | null {
  return taskId.startsWith('review-') ? taskId.slice('review-'.length) : null;
}

export function assertTaskStatus(value: unknown): TaskStatus {
  if (value === 'pending' || value === 'in_progress' || value === 'needs_review' || value === 'done') {
    return value;
  }

  throw new Error('Invalid JSON body: expected task status');
}
