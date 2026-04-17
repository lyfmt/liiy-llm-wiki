import type { ChangeSet } from '../../../domain/change-set.js';
import type { RequestRunEvent, RequestRunState, RequestRunTimelineItem } from '../../../storage/request-run-state-store.js';
import type {
  ChangeSetDto,
  ChangeSetSummaryDto,
  ReviewDecisionResponseDto,
  ReviewSummaryDto,
  RunDetailEventDto,
  RunDetailResponseDto,
  RunDetailToolOutcomeDto,
  RunSummaryDto,
  RunTimelineItemDto
} from '../dto/run.js';

export function toRunSummaryDto(input: {
  run_id: string;
  state: RequestRunState;
  review_task_id: string | null;
}): RunSummaryDto {
  return {
    run_id: input.run_id,
    session_id: input.state.request_run.session_id,
    status: input.state.request_run.status,
    intent: input.state.request_run.intent,
    result_summary: input.state.request_run.result_summary,
    touched_files: [...input.state.request_run.touched_files],
    has_changeset: input.state.changeset !== null,
    review_task_id: input.review_task_id
  };
}

export function toRunSummaryListDto(
  entries: Array<{
    run_id: string;
    state: RequestRunState;
    review_task_id: string | null;
  }>
): RunSummaryDto[] {
  return entries.map((entry) => toRunSummaryDto(entry));
}

export function toChangeSetSummaryDto(input: { run_id: string; state: RequestRunState }): ChangeSetSummaryDto | null {
  if (input.state.changeset === null) {
    return null;
  }

  return {
    run_id: input.run_id,
    status: input.state.request_run.status,
    changeset: toChangeSetDto(input.state.changeset)
  };
}

export function toRunDetailResponseDto(state: RequestRunState): RunDetailResponseDto {
  return {
    request_run: {
      run_id: state.request_run.run_id,
      session_id: state.request_run.session_id,
      user_request: state.request_run.user_request,
      intent: state.request_run.intent,
      plan: [...state.request_run.plan],
      status: state.request_run.status,
      evidence: [...state.request_run.evidence],
      touched_files: [...state.request_run.touched_files],
      decisions: [...state.request_run.decisions],
      result_summary: state.request_run.result_summary
    },
    tool_outcomes: state.tool_outcomes.map((outcome): RunDetailToolOutcomeDto => ({
      order: outcome.order,
      tool_name: outcome.toolName,
      summary: outcome.summary,
      evidence: [...(outcome.evidence ?? [])],
      touched_files: [...(outcome.touchedFiles ?? [])],
      change_set: outcome.changeSet ? toChangeSetDto(outcome.changeSet) : null,
      result_markdown: outcome.resultMarkdown ?? null,
      needs_review: outcome.needsReview ?? false,
      review_reasons: [...(outcome.reviewReasons ?? [])],
      has_structured_data: outcome.data !== undefined
    })),
    events: (state.events ?? []).map((event): RunDetailEventDto => toRunDetailEventDto(event)),
    timeline_items: (state.timeline_items ?? []).map((item): RunTimelineItemDto => toRunTimelineItemDto(item)),
    draft_markdown: state.draft_markdown,
    result_markdown: state.result_markdown,
    changeset: state.changeset ? toChangeSetDto(state.changeset) : null
  };
}

export function toReviewSummaryDto(input: {
  run_id: string;
  state: RequestRunState;
  can_resolve: boolean;
}): ReviewSummaryDto {
  return {
    run_id: input.run_id,
    user_request: input.state.request_run.user_request,
    status: input.state.request_run.status,
    changeset: input.state.changeset ? toChangeSetDto(input.state.changeset) : null,
    decisions: [...input.state.request_run.decisions],
    evidence: [...input.state.request_run.evidence],
    touched_files: [...input.state.request_run.touched_files],
    can_resolve: input.can_resolve
  };
}

export function toReviewDecisionResponseDto(input: {
  decision: 'approve' | 'reject';
  run_id: string;
  state: RequestRunState;
  touched_files: string[];
}): ReviewDecisionResponseDto {
  return {
    ok: true,
    decision: input.decision,
    status: input.state.request_run.status,
    touched_files: [...input.touched_files],
    result_summary: input.state.request_run.result_summary,
    run_url: `/api/runs/${encodeURIComponent(input.run_id)}`,
    review_url: `/api/reviews/${encodeURIComponent(input.run_id)}`
  };
}

export function toChangeSetDto(changeSet: ChangeSet): ChangeSetDto {
  return {
    target_files: [...changeSet.target_files],
    patch_summary: changeSet.patch_summary,
    rationale: changeSet.rationale,
    source_refs: [...changeSet.source_refs],
    risk_level: changeSet.risk_level,
    needs_review: changeSet.needs_review
  };
}

function toRunDetailEventDto(event: RequestRunEvent): RunDetailEventDto {
  return {
    type: event.type,
    timestamp: event.timestamp,
    summary: event.summary,
    status: event.status ?? null,
    tool_name: event.tool_name ?? null,
    tool_call_id: event.tool_call_id ?? null,
    evidence: [...(event.evidence ?? [])],
    touched_files: [...(event.touched_files ?? [])],
    has_structured_data: event.data !== undefined
  };
}

function toRunTimelineItemDto(item: RequestRunTimelineItem): RunTimelineItemDto {
  return {
    lane: item.lane,
    title: item.title,
    summary: item.summary,
    timestamp: item.timestamp ?? null,
    meta: item.meta ?? null
  };
}
