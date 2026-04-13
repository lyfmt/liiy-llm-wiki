import { createRequestRun, type RequestRun } from '../domain/request-run.js';
import type { ChangeSet } from '../domain/change-set.js';
import type { RequestRunState } from '../storage/request-run-state-store.js';
import type { RuntimeIntent } from './intent-classifier.js';

export interface RuntimeToolOutcome {
  toolName: string;
  summary: string;
  evidence?: string[];
  touchedFiles?: string[];
  changeSet?: ChangeSet | null;
  resultMarkdown?: string;
  needsReview?: boolean;
  reviewReasons?: string[];
}

export interface CreateRuntimeRunStateInput {
  runId: string;
  userRequest: string;
  intent: RuntimeIntent;
  plan: string[];
  toolOutcomes: RuntimeToolOutcome[];
  assistantSummary: string;
  status?: RequestRun['status'];
}

export function createRuntimeRunState(input: CreateRuntimeRunStateInput): RequestRunState {
  const evidence = uniqueStrings(input.toolOutcomes.flatMap((outcome) => outcome.evidence ?? []));
  const touchedFiles = uniqueStrings(input.toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? []));
  const decisions = input.toolOutcomes.flatMap((outcome) => {
    const reviewReasons = outcome.reviewReasons ?? [];

    if (outcome.needsReview && reviewReasons.length > 0) {
      return reviewReasons.map((reason) => `${outcome.toolName}: ${reason}`);
    }

    return [`${outcome.toolName}: ${outcome.summary}`];
  });
  const changeset = selectFinalChangeSet(input.toolOutcomes);
  const needsReview = input.toolOutcomes.some((outcome) => outcome.needsReview);
  const requestRun = createRequestRun({
    run_id: input.runId,
    user_request: input.userRequest,
    intent: input.intent,
    plan: input.plan,
    status: input.status ?? (needsReview ? 'needs_review' : 'done'),
    evidence,
    touched_files: touchedFiles,
    decisions,
    result_summary: input.assistantSummary
  });

  return {
    request_run: requestRun,
    draft_markdown: buildDraftMarkdown(input, requestRun),
    result_markdown: buildResultMarkdown(input, requestRun),
    changeset
  };
}

function selectFinalChangeSet(toolOutcomes: RuntimeToolOutcome[]): ChangeSet | null {
  const changeSets = toolOutcomes.flatMap((outcome) => (outcome.changeSet ? [outcome.changeSet] : []));

  if (changeSets.length === 0) {
    return null;
  }

  if (changeSets.length === 1) {
    return changeSets[0]!;
  }

  const targetFiles = uniqueStrings(changeSets.flatMap((changeSet) => changeSet.target_files));
  const sourceRefs = uniqueStrings(changeSets.flatMap((changeSet) => changeSet.source_refs));
  const needsReview = changeSets.some((changeSet) => changeSet.needs_review);
  const riskLevel = changeSets.some((changeSet) => changeSet.risk_level === 'high')
    ? 'high'
    : changeSets.some((changeSet) => changeSet.risk_level === 'medium')
      ? 'medium'
      : 'low';

  return {
    target_files: targetFiles,
    patch_summary: `runtime applied ${changeSets.length} tool outcomes`,
    rationale: 'aggregate runtime changeset',
    source_refs: sourceRefs,
    risk_level: riskLevel,
    needs_review: needsReview
  };
}

function buildDraftMarkdown(input: CreateRuntimeRunStateInput, requestRun: RequestRun): string {
  const planLines = input.plan.map((step) => `- ${step}`).join('\n');
  const outcomeLines = input.toolOutcomes
    .map((outcome) => `- ${outcome.toolName}: ${outcome.summary}`)
    .join('\n');

  return `# Runtime Draft\n\n## Request\n${requestRun.user_request}\n\n## Intent\n${requestRun.intent}\n\n## Plan\n${planLines || '- _none_'}\n\n## Tool Outcomes\n${outcomeLines || '- _none_'}\n`;
}

function buildResultMarkdown(input: CreateRuntimeRunStateInput, requestRun: RequestRun): string {
  const blocks = [`# Runtime Result`, '', input.assistantSummary, '', `Status: ${requestRun.status}`];

  for (const outcome of input.toolOutcomes) {
    blocks.push('', `## ${outcome.toolName}`, outcome.resultMarkdown ?? outcome.summary);
  }

  return `${blocks.join('\n')}\n`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
