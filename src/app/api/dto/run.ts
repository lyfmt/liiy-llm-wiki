import type { RequestRunStatus } from '../../../domain/request-run.js';

export interface ChangeSetDto {
  target_files: string[];
  patch_summary: string;
  rationale: string;
  source_refs: string[];
  risk_level: string;
  needs_review: boolean;
}

export interface RunSummaryDto {
  run_id: string;
  session_id: string | null;
  status: RequestRunStatus;
  intent: string;
  result_summary: string;
  touched_files: string[];
  has_changeset: boolean;
  review_task_id: string | null;
}

export interface ChangeSetSummaryDto {
  run_id: string;
  status: RequestRunStatus;
  changeset: ChangeSetDto;
}

export interface RunDetailToolOutcomeDto {
  order: number;
  tool_name: string;
  summary: string;
  evidence: string[];
  touched_files: string[];
  change_set: ChangeSetDto | null;
  result_markdown: string | null;
  needs_review: boolean;
  review_reasons: string[];
  has_structured_data: boolean;
}

export interface RunDetailEventDto {
  type: string;
  timestamp: string;
  summary: string;
  status: RequestRunStatus | null;
  tool_name: string | null;
  tool_call_id: string | null;
  evidence: string[];
  touched_files: string[];
  has_structured_data: boolean;
}

export interface RunTimelineItemDto {
  lane: 'user' | 'assistant' | 'tool' | 'system';
  title: string;
  summary: string;
  timestamp: string | null;
  meta: string | null;
}

export interface RunDetailResponseDto {
  request_run: {
    run_id: string;
    session_id: string | null;
    user_request: string;
    intent: string;
    plan: string[];
    status: RequestRunStatus;
    evidence: string[];
    touched_files: string[];
    decisions: string[];
    result_summary: string;
  };
  tool_outcomes: RunDetailToolOutcomeDto[];
  events: RunDetailEventDto[];
  timeline_items: RunTimelineItemDto[];
  draft_markdown: string;
  result_markdown: string;
  changeset: ChangeSetDto | null;
}

export interface ReviewSummaryDto {
  run_id: string;
  user_request: string;
  status: RequestRunStatus;
  changeset: ChangeSetDto | null;
  decisions: string[];
  evidence: string[];
  touched_files: string[];
  can_resolve: boolean;
}

export interface ReviewDecisionResponseDto {
  ok: boolean;
  decision: 'approve' | 'reject';
  status: RequestRunStatus;
  touched_files: string[];
  result_summary: string;
  run_url: string;
  review_url: string;
}
