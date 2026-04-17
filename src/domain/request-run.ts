export type RequestRunStatus = 'running' | 'needs_review' | 'done' | 'failed' | 'rejected';

export interface RequestRun {
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
}

export interface CreateRequestRunInput {
  run_id: string;
  session_id?: string | null;
  user_request: string;
  intent: string;
  plan: string[];
  status?: RequestRunStatus;
  evidence?: string[];
  touched_files?: string[];
  decisions?: string[];
  result_summary?: string;
}

export function createRequestRun(input: CreateRequestRunInput): RequestRun {
  return {
    run_id: input.run_id,
    session_id: input.session_id ?? null,
    user_request: input.user_request,
    intent: input.intent,
    plan: [...input.plan],
    status: input.status ?? 'running',
    evidence: [...(input.evidence ?? [])],
    touched_files: [...(input.touched_files ?? [])],
    decisions: [...(input.decisions ?? [])],
    result_summary: input.result_summary ?? ''
  };
}
