import { createKnowledgeTask, type KnowledgeTask } from '../../domain/task.js';
import { type RequestRunState } from '../../storage/request-run-state-store.js';
import { loadKnowledgeTask, saveKnowledgeTask } from '../../storage/task-store.js';

export async function syncReviewTask(root: string, runState: RequestRunState): Promise<KnowledgeTask | null> {
  if (isDerivedToolRunId(runState.request_run.run_id)) {
    return null;
  }

  const taskId = buildReviewTaskId(runState.request_run.run_id);
  const existingTask = await loadKnowledgeTaskIfExists(root, taskId);

  if (!isReviewTaskRelevant(runState, existingTask)) {
    return null;
  }

  const timestamp = new Date().toISOString();
  const task = createKnowledgeTask({
    id: taskId,
    title: buildReviewTaskTitle(runState),
    description: buildReviewTaskDescription(runState),
    status: deriveTaskStatus(runState, existingTask),
    evidence: collectTaskEvidence(runState),
    assignee: existingTask?.assignee || 'operator',
    created_at: existingTask?.created_at ?? timestamp,
    updated_at: timestamp
  });

  await saveKnowledgeTask(root, task);
  return task;
}

export function buildReviewTaskId(runId: string): string {
  return `review-${runId}`;
}

function deriveTaskStatus(runState: RequestRunState, existingTask: KnowledgeTask | null): KnowledgeTask['status'] {
  if (runState.request_run.status === 'needs_review') {
    return existingTask?.status === 'in_progress' ? 'in_progress' : 'needs_review';
  }

  return 'done';
}

function isReviewTaskRelevant(runState: RequestRunState, existingTask: KnowledgeTask | null): boolean {
  return runState.request_run.status === 'needs_review' || existingTask !== null;
}

function buildReviewTaskTitle(runState: RequestRunState): string {
  const request = normalizeSingleLine(runState.request_run.user_request);

  return `Review: ${truncateText(request || runState.request_run.run_id, 96)}`;
}

function buildReviewTaskDescription(runState: RequestRunState): string {
  const lines = [
    `Governed review task for run ${runState.request_run.run_id}.`,
    `Request: ${normalizeSingleLine(runState.request_run.user_request) || '_none_'}`,
    `Intent: ${runState.request_run.intent}`,
    `Run status: ${runState.request_run.status}`,
    `Patch summary: ${runState.changeset?.patch_summary ?? 'operator review required'}`,
    `Rationale: ${runState.changeset?.rationale ?? '_none_'}`,
    `Risk level: ${runState.changeset?.risk_level ?? '_none_'}`,
    `Result summary: ${normalizeSingleLine(runState.request_run.result_summary) || '_none_'}`
  ];

  if (runState.changeset?.target_files.length) {
    lines.push(`Target files: ${runState.changeset.target_files.join(', ')}`);
  }

  if (runState.request_run.decisions.length > 0) {
    lines.push(`Decisions: ${runState.request_run.decisions.join('; ')}`);
  }

  return `${lines.join('\n')}\n`;
}

function collectTaskEvidence(runState: RequestRunState): string[] {
  return uniqueStrings([
    ...runState.request_run.evidence,
    ...(runState.changeset?.source_refs ?? []),
    ...(runState.changeset?.target_files ?? [])
  ]);
}

async function loadKnowledgeTaskIfExists(root: string, taskId: string): Promise<KnowledgeTask | null> {
  try {
    return await loadKnowledgeTask(root, taskId);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === `Incomplete task state: missing ${taskId}.json`) {
      return null;
    }

    throw error;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isDerivedToolRunId(runId: string): boolean {
  return runId.includes('--');
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
