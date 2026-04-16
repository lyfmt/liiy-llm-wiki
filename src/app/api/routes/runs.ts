import { toReviewDecisionResponseDto } from '../mappers/run.js';
import { parseReviewDecisionRequestDto } from '../services/command.js';
import { listChangeSetSummariesDto, listRunSummariesDto, loadReviewSummaryDto, loadRunDetailResponseDto } from '../services/run.js';
import type { ApiRouteContext } from '../route-context.js';
import { writeJson, readJsonBody } from '../route-helpers.js';
import { runReviewDecisionFlow } from '../../../flows/review/run-review-decision-flow.js';
import { loadRequestRunState } from '../../../storage/request-run-state-store.js';

export async function handleRunRoutes(context: ApiRouteContext): Promise<boolean> {
  const { root, request, response, method, pathname } = context;

  if (method === 'GET' && pathname === '/api/runs') {
    writeJson(response, 200, await listRunSummariesDto(root));
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/runs/')) {
    const runId = decodeURIComponent(pathname.slice('/api/runs/'.length));
    await loadRequestRunState(root, runId);
    writeJson(response, 200, await loadRunDetailResponseDto(root, runId));
    return true;
  }

  if (method === 'GET' && pathname === '/api/changesets') {
    writeJson(response, 200, await listChangeSetSummariesDto(root));
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/reviews/')) {
    const runId = decodeURIComponent(pathname.slice('/api/reviews/'.length));
    writeJson(response, 200, await loadReviewSummaryDto(root, runId));
    return true;
  }

  if (method === 'POST' && pathname.startsWith('/api/reviews/') && pathname.endsWith('/decision')) {
    const runId = decodeURIComponent(pathname.slice('/api/reviews/'.length, pathname.length - '/decision'.length));
    const payload = parseReviewDecisionRequestDto(await readJsonBody(request));
    const result = await runReviewDecisionFlow(root, {
      runId,
      decision: payload.decision,
      reviewer: payload.reviewer,
      note: payload.note
    });

    writeJson(
      response,
      200,
      toReviewDecisionResponseDto({
        decision: result.decision,
        run_id: runId,
        state: result.runState,
        touched_files: result.touchedFiles
      })
    );
    return true;
  }

  return false;
}
