import { buildReviewTaskId } from '../../../flows/review/sync-review-task.js';
import {
  listRequestRunIds,
  loadRequestRunState,
  type RequestRunState
} from '../../../storage/request-run-state-store.js';
import { listKnowledgeTasks } from '../../../storage/task-store.js';
import type {
  ChangeSetSummaryDto,
  ReviewSummaryDto,
  RunDetailResponseDto,
  RunSummaryDto
} from '../dto/run.js';
import {
  toChangeSetSummaryDto,
  toReviewSummaryDto,
  toRunDetailResponseDto,
  toRunSummaryListDto
} from '../mappers/run.js';

export async function listRunSummariesDto(root: string): Promise<RunSummaryDto[]> {
  const runIds = (await listRequestRunIds(root)).filter((runId) => !isDerivedToolRunId(runId));
  const tasks = await listKnowledgeTasks(root);
  const reviewTaskIds = new Set(tasks.map((task) => task.id));
  const runs = await Promise.all(
    runIds.map(async (runId) => ({ run_id: runId, state: await loadRequestRunStateIfExists(root, runId) }))
  );

  return toRunSummaryListDto(
    runs
      .filter((entry): entry is { run_id: string; state: RequestRunState } => entry.state !== null)
      .map((entry) => ({
        run_id: entry.run_id,
        state: entry.state,
        review_task_id: reviewTaskIds.has(buildReviewTaskId(entry.run_id)) ? buildReviewTaskId(entry.run_id) : null
      }))
  );
}

export async function listChangeSetSummariesDto(root: string): Promise<ChangeSetSummaryDto[]> {
  const runIds = await listRequestRunIds(root);
  const changesets = await Promise.all(
    runIds.map(async (runId) => {
      const state = await loadRequestRunStateIfExists(root, runId);
      return state === null ? null : toChangeSetSummaryDto({ run_id: runId, state });
    })
  );

  return changesets.filter((entry): entry is ChangeSetSummaryDto => entry !== null);
}

export async function loadRunDetailResponseDto(root: string, runId: string): Promise<RunDetailResponseDto> {
  return toRunDetailResponseDto(await loadRequestRunState(root, runId));
}

export async function loadReviewSummaryDto(root: string, runId: string): Promise<ReviewSummaryDto> {
  const state = await loadRequestRunState(root, runId);

  return toReviewSummaryDto({
    run_id: runId,
    state,
    can_resolve: state.request_run.status === 'needs_review' && hasReplayableReviewPayload(state.tool_outcomes)
  });
}

function isDerivedToolRunId(runId: string): boolean {
  return runId.includes('--');
}

async function loadRequestRunStateIfExists(root: string, runId: string): Promise<RequestRunState | null> {
  try {
    return await loadRequestRunState(root, runId);
  } catch (error: unknown) {
    if (
      error instanceof Error
      && (
        error.message.startsWith('Incomplete request run state: missing ')
        || error.message.startsWith('Invalid request run state: ')
      )
    ) {
      return null;
    }

    throw error;
  }
}

function hasReplayableReviewPayload(toolOutcomes: RequestRunState['tool_outcomes']): boolean {
  return toolOutcomes.some((outcome) => {
    const data = outcome.data;

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const draft = (data as Record<string, unknown>).draft;

      if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
        return true;
      }
    }

    return typeof outcome.resultMarkdown === 'string' && outcome.resultMarkdown.includes('## Upsert Arguments');
  });
}
