import { createRequestRun, type RequestRun } from '../domain/request-run.js';
import type { ChangeSet } from '../domain/change-set.js';
import { evaluateReviewGate } from '../policies/review-gate.js';
import type {
  RequestRunEvent,
  RequestRunState,
  RequestRunTimelineItem
} from '../storage/request-run-state-store.js';
import type { RuntimeIntent } from './intent-classifier.js';

export interface PersistedRuntimeToolOutcome extends RuntimeToolOutcome {
  order: number;
}

export interface RuntimeToolOutcome {
  toolName: string;
  summary: string;
  evidence?: string[];
  touchedFiles?: string[];
  changeSet?: ChangeSet | null;
  resultMarkdown?: string;
  needsReview?: boolean;
  reviewReasons?: string[];
  data?: Record<string, unknown>;
}

export interface CreateRuntimeRunStateInput {
  runId: string;
  sessionId?: string | null;
  userRequest: string;
  intent: RuntimeIntent;
  plan: string[];
  toolOutcomes: RuntimeToolOutcome[];
  assistantSummary: string;
  status?: RequestRun['status'];
  events?: RequestRunEvent[];
  timelineItems?: RequestRunTimelineItem[];
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
    session_id: input.sessionId ?? null,
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
    tool_outcomes: buildPersistedToolOutcomes(input.toolOutcomes),
    events: input.events ?? [],
    timeline_items: buildTimelineItems(input, requestRun),
    draft_markdown: buildDraftMarkdown(input, requestRun),
    result_markdown: buildResultMarkdown(input, requestRun),
    changeset
  };
}

function buildPersistedToolOutcomes(toolOutcomes: RuntimeToolOutcome[]): PersistedRuntimeToolOutcome[] {
  return toolOutcomes.map((outcome, index) => ({
    order: index + 1,
    ...outcome
  }));
}

function buildTimelineItems(input: CreateRuntimeRunStateInput, requestRun: RequestRun): RequestRunTimelineItem[] {
  if (input.timelineItems && input.timelineItems.length > 0) {
    return input.timelineItems;
  }

  const items: RequestRunTimelineItem[] = [
    {
      lane: 'user',
      title: 'User request',
      summary: requestRun.user_request,
      meta: `intent: ${requestRun.intent}`
    }
  ];

  if (requestRun.plan.length > 0) {
    items.push({
      lane: 'assistant',
      title: 'Execution plan',
      summary: `${requestRun.plan.length} step${requestRun.plan.length === 1 ? '' : 's'} planned`,
      meta: requestRun.plan.join(' → ')
    });
  }

  const latestEvent = input.events?.at(-1);

  if (latestEvent) {
    items.push({
      lane: latestEvent.type.startsWith('tool_') ? 'tool' : 'system',
      title: 'Latest persisted event',
      summary: latestEvent.summary,
      timestamp: latestEvent.timestamp,
      meta: [
        latestEvent.type,
        latestEvent.tool_name ? `tool: ${latestEvent.tool_name}` : null,
        latestEvent.status ? `status: ${latestEvent.status}` : null
      ]
        .filter((value): value is string => value !== null)
        .join(' · ')
    });
  }

  const latestToolOutcome = input.toolOutcomes.at(-1);

  if (latestToolOutcome) {
    items.push({
      lane: 'tool',
      title: `Latest tool outcome · ${latestToolOutcome.toolName}`,
      summary: latestToolOutcome.summary,
      meta: [
        latestToolOutcome.needsReview ? 'needs review' : 'clear',
        latestToolOutcome.touchedFiles && latestToolOutcome.touchedFiles.length > 0
          ? `files: ${latestToolOutcome.touchedFiles.join(', ')}`
          : null
      ]
        .filter((value): value is string => value !== null)
        .join(' · ')
    });
  }

  items.push({
    lane: 'assistant',
    title: 'Result summary',
    summary: requestRun.result_summary || 'No result summary persisted yet.',
    meta: `output: ${requestRun.result_summary.trim().length > 0 ? 'result available' : 'pending'}`
  });

  return items;
}

function selectFinalChangeSet(toolOutcomes: RuntimeToolOutcome[]): ChangeSet | null {
  const changeSets = toolOutcomes.flatMap((outcome) => (outcome.changeSet ? [outcome.changeSet] : []));
  const explicitNeedsReview = toolOutcomes.some((outcome) => outcome.needsReview === true);

  if (changeSets.length === 0) {
    return null;
  }

  if (changeSets.length === 1) {
    const singleChangeSet = changeSets[0]!;
    const review = evaluateReviewGate(singleChangeSet);

    return {
      ...singleChangeSet,
      needs_review: singleChangeSet.needs_review || explicitNeedsReview || review.needs_review
    };
  }

  const targetFiles = uniqueStrings(changeSets.flatMap((changeSet) => changeSet.target_files));
  const sourceRefs = uniqueStrings(changeSets.flatMap((changeSet) => changeSet.source_refs));
  const riskLevel = changeSets.some((changeSet) => changeSet.risk_level === 'high')
    ? 'high'
    : changeSets.some((changeSet) => changeSet.risk_level === 'medium')
      ? 'medium'
      : 'low';
  const aggregatedChangeSet: ChangeSet = {
    target_files: targetFiles,
    patch_summary: `runtime applied ${changeSets.length} tool outcomes`,
    rationale: 'aggregate runtime changeset',
    source_refs: sourceRefs,
    risk_level: riskLevel,
    needs_review: explicitNeedsReview || changeSets.some((changeSet) => changeSet.needs_review)
  };
  const review = evaluateReviewGate(aggregatedChangeSet);

  return {
    ...aggregatedChangeSet,
    needs_review: aggregatedChangeSet.needs_review || review.needs_review
  };
}

function buildDraftMarkdown(input: CreateRuntimeRunStateInput, requestRun: RequestRun): string {
  const preferredDraft = selectPreferredDraftOutcome(input.toolOutcomes);

  if (preferredDraft?.resultMarkdown) {
    const metadata = [
      '# Runtime Draft',
      '',
      '## Request',
      requestRun.user_request,
      '',
      '## Intent',
      requestRun.intent,
      '',
      '## Draft Source',
      `${preferredDraft.toolName}: ${preferredDraft.summary}`,
      ''
    ].join('\n');

    return `${metadata}${preferredDraft.resultMarkdown.endsWith('\n') ? preferredDraft.resultMarkdown : `${preferredDraft.resultMarkdown}\n`}`;
  }

  const planLines = input.plan.map((step) => `- ${step}`).join('\n');
  const outcomeLines = input.toolOutcomes
    .map((outcome) => `- ${outcome.toolName}: ${outcome.summary}`)
    .join('\n');

  return `# Runtime Draft\n\n## Request\n${requestRun.user_request}\n\n## Intent\n${requestRun.intent}\n\n## Plan\n${planLines || '- _none_'}\n\n## Tool Outcomes\n${outcomeLines || '- _none_'}\n`;
}

function buildResultMarkdown(input: CreateRuntimeRunStateInput, requestRun: RequestRun): string {
  const blocks = [
    `# Runtime Result`,
    '',
    `Request: ${requestRun.user_request}`,
    `Intent: ${requestRun.intent}`,
    `Status: ${requestRun.status}`,
    `Touched files: ${requestRun.touched_files.join(', ') || '_none_'}`,
    `Evidence: ${requestRun.evidence.join(', ') || '_none_'}`,
    '',
    input.assistantSummary
  ];

  for (const outcome of input.toolOutcomes) {
    blocks.push('', `## ${outcome.toolName}`, outcome.resultMarkdown ?? outcome.summary);
  }

  return `${blocks.join('\n')}\n`;
}

function selectPreferredDraftOutcome(toolOutcomes: RuntimeToolOutcome[]): RuntimeToolOutcome | undefined {
  return toolOutcomes.find((outcome) => outcome.toolName === 'draft_knowledge_page' && typeof outcome.resultMarkdown === 'string')
    ?? toolOutcomes.find((outcome) => typeof outcome.resultMarkdown === 'string' && outcome.resultMarkdown.includes('## Proposed Body'));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
