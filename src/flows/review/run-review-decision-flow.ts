import { createKnowledgePage, type KnowledgePage, type KnowledgePageKind } from '../../domain/knowledge-page.js';
import { appendWikiLog, rewriteWikiIndex } from '../wiki/maintain-wiki-navigation.js';
import { loadKnowledgePage, saveKnowledgePage, type LoadedKnowledgePage } from '../../storage/knowledge-page-store.js';
import { loadRequestRunState, saveRequestRunState, type RequestRunState } from '../../storage/request-run-state-store.js';
import type { PersistedRuntimeToolOutcome } from '../../runtime/request-run-state.js';
import { syncReviewTask } from './sync-review-task.js';

export type ReviewDecision = 'approve' | 'reject';

export interface RunReviewDecisionFlowInput {
  runId: string;
  decision: ReviewDecision;
  reviewer?: string;
  note?: string;
}

export interface RunReviewDecisionFlowResult {
  decision: ReviewDecision;
  runState: RequestRunState;
  touchedFiles: string[];
}

interface ReplayableDraftPayload {
  targetPath: string;
  upsertArguments: ReviewableUpsertArguments;
}

interface ReviewableUpsertArguments {
  kind: KnowledgePageKind;
  slug: string;
  title: string;
  aliases?: string[];
  summary?: string;
  tags?: string[];
  source_refs: string[];
  outgoing_links?: string[];
  status: string;
  updated_at?: string;
  body: string;
  rationale: string;
}

export async function runReviewDecisionFlow(
  root: string,
  input: RunReviewDecisionFlowInput
): Promise<RunReviewDecisionFlowResult> {
  const runState = await loadRequestRunState(root, input.runId);

  if (runState.request_run.status !== 'needs_review') {
    throw new Error(`Review is not pending for run ${input.runId}`);
  }

  const reviewer = normalizeSingleLine(input.reviewer) || 'operator';
  const note = normalizeSingleLine(input.note);

  if (input.decision === 'reject') {
    const rejectedState: RequestRunState = {
      ...runState,
      request_run: {
        ...runState.request_run,
        status: 'rejected',
        touched_files: [],
        decisions: [...runState.request_run.decisions, buildReviewDecisionLine('reject', reviewer, note)],
        result_summary: note ? `review rejected: ${note}` : 'review rejected'
      },
      result_markdown: appendReviewResolution(runState.result_markdown, {
        decision: 'reject',
        reviewer,
        note,
        touchedFiles: []
      }),
      changeset: runState.changeset ? { ...runState.changeset, needs_review: false } : null
    };

    await saveRequestRunState(root, rejectedState);
    await syncReviewTask(root, rejectedState);

    return {
      decision: 'reject',
      runState: rejectedState,
      touchedFiles: []
    };
  }

  const payload = extractReplayableDraftPayload(runState.tool_outcomes);

  if (!payload) {
    throw new Error('Review approval requires a stored draft upsert payload');
  }

  const touchedFiles = await applyApprovedDraftPayload(root, payload.upsertArguments);
  const approvedState: RequestRunState = {
    ...runState,
    request_run: {
      ...runState.request_run,
      status: 'done',
      touched_files: touchedFiles,
      decisions: [...runState.request_run.decisions, buildReviewDecisionLine('approve', reviewer, note)],
      result_summary: buildApprovedResultSummary(touchedFiles, note)
    },
    result_markdown: appendReviewResolution(runState.result_markdown, {
      decision: 'approve',
      reviewer,
      note,
      touchedFiles
    }),
    changeset: runState.changeset ? { ...runState.changeset, needs_review: false } : null
  };

  await saveRequestRunState(root, approvedState);
  await syncReviewTask(root, approvedState);

  return {
    decision: 'approve',
    runState: approvedState,
    touchedFiles
  };
}

function extractReplayableDraftPayload(
  toolOutcomes: PersistedRuntimeToolOutcome[]
): ReplayableDraftPayload | null {
  for (const outcome of [...toolOutcomes].reverse()) {
    const fromData = extractReplayableDraftPayloadFromData(outcome);

    if (fromData) {
      return fromData;
    }

    const fromMarkdown = extractReplayableDraftPayloadFromMarkdown(outcome);

    if (fromMarkdown) {
      return fromMarkdown;
    }
  }

  return null;
}

function extractReplayableDraftPayloadFromData(
  outcome: PersistedRuntimeToolOutcome
): ReplayableDraftPayload | null {
  if (!isRecord(outcome.data)) {
    return null;
  }

  const draft = outcome.data.draft;

  if (!isRecord(draft) || typeof draft.targetPath !== 'string' || !isReviewableUpsertArguments(draft.upsertArguments)) {
    return null;
  }

  return {
    targetPath: draft.targetPath,
    upsertArguments: draft.upsertArguments
  };
}

function extractReplayableDraftPayloadFromMarkdown(
  outcome: PersistedRuntimeToolOutcome
): ReplayableDraftPayload | null {
  const resultMarkdown = outcome.resultMarkdown;

  if (typeof resultMarkdown !== 'string') {
    return null;
  }

  const marker = '## Upsert Arguments\n';
  const markerIndex = resultMarkdown.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const jsonText = resultMarkdown.slice(markerIndex + marker.length).trim();

  if (jsonText.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;

    if (!isReviewableUpsertArguments(parsed)) {
      return null;
    }

    return {
      targetPath: buildPagePath(parsed.kind, parsed.slug),
      upsertArguments: parsed
    };
  } catch {
    return null;
  }
}

async function applyApprovedDraftPayload(root: string, upsertArguments: ReviewableUpsertArguments): Promise<string[]> {
  const pagePath = buildPagePath(upsertArguments.kind, upsertArguments.slug);
  const page = createKnowledgePage({
    path: pagePath,
    kind: upsertArguments.kind,
    title: upsertArguments.title,
    aliases: [...(upsertArguments.aliases ?? [])],
    summary: upsertArguments.summary ?? '',
    tags: [...(upsertArguments.tags ?? [])],
    source_refs: [...upsertArguments.source_refs],
    outgoing_links: [...(upsertArguments.outgoing_links ?? [])],
    status: upsertArguments.status,
    updated_at: upsertArguments.updated_at ?? new Date().toISOString()
  });
  const normalizedBody = normalizeBody(upsertArguments.body, upsertArguments.title);
  const existing = await loadPageIfExists(root, upsertArguments.kind, upsertArguments.slug);

  if (!hasPageChanged(existing, page, normalizedBody)) {
    return [];
  }

  const touchedFiles: string[] = [];
  await saveKnowledgePage(root, page, normalizedBody);
  touchedFiles.push(pagePath);

  if (await rewriteWikiIndex(root)) {
    touchedFiles.push('wiki/index.md');
  }

  if (await appendWikiLog(root, `- review-approved ${page.kind} ${page.path}: ${upsertArguments.rationale}\n`)) {
    touchedFiles.push('wiki/log.md');
  }

  return touchedFiles;
}

async function loadPageIfExists(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<LoadedKnowledgePage | null> {
  try {
    return await loadKnowledgePage(root, kind, slug);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function hasPageChanged(existing: LoadedKnowledgePage | null, page: KnowledgePage, body: string): boolean {
  if (!existing) {
    return true;
  }

  return (
    existing.page.title !== page.title ||
    !sameStringArray(existing.page.aliases, page.aliases) ||
    existing.page.summary !== page.summary ||
    !sameStringArray(existing.page.tags, page.tags) ||
    !sameStringArray(existing.page.source_refs, page.source_refs) ||
    !sameStringArray(existing.page.outgoing_links, page.outgoing_links) ||
    existing.page.status !== page.status ||
    existing.page.updated_at !== page.updated_at ||
    existing.body !== body
  );
}

function normalizeBody(body: string, title: string): string {
  const trimmed = body.trim();
  return trimmed.length === 0 ? `# ${title}\n` : `${trimmed}\n`;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildReviewDecisionLine(decision: ReviewDecision, reviewer: string, note: string): string {
  const action = decision === 'approve' ? 'review approved' : 'review rejected';
  return note ? `${action} by ${reviewer}: ${note}` : `${action} by ${reviewer}`;
}

function buildApprovedResultSummary(touchedFiles: string[], note: string): string {
  if (note) {
    return `review approved: ${note}`;
  }

  return touchedFiles.length === 0 ? 'review approved with no wiki changes' : 'review approved and applied';
}

function appendReviewResolution(
  markdown: string,
  input: { decision: ReviewDecision; reviewer: string; note: string; touchedFiles: string[] }
): string {
  const prefix = markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  const lines = [
    '',
    '## Review Resolution',
    `Decision: ${input.decision}`,
    `Reviewer: ${input.reviewer}`,
    `Note: ${input.note || '_none_'}`,
    `Touched files: ${input.touchedFiles.join(', ') || '_none_'}`
  ];

  return `${prefix}${lines.join('\n')}\n`;
}

function buildPagePath(kind: KnowledgePageKind, slug: string): string {
  const directory = kind === 'source' ? 'sources' : kind === 'entity' ? 'entities' : kind === 'query' ? 'queries' : 'topics';
  return `wiki/${directory}/${slug}.md`;
}

function isReviewableUpsertArguments(value: unknown): value is ReviewableUpsertArguments {
  return (
    isRecord(value) &&
    isKnowledgePageKind(value.kind) &&
    typeof value.slug === 'string' &&
    typeof value.title === 'string' &&
    (!('aliases' in value) || isStringArray(value.aliases)) &&
    (!('summary' in value) || typeof value.summary === 'string') &&
    (!('tags' in value) || isStringArray(value.tags)) &&
    isStringArray(value.source_refs) &&
    (!('outgoing_links' in value) || isStringArray(value.outgoing_links)) &&
    typeof value.status === 'string' &&
    (!('updated_at' in value) || typeof value.updated_at === 'string') &&
    typeof value.body === 'string' &&
    typeof value.rationale === 'string'
  );
}

function isKnowledgePageKind(value: unknown): value is KnowledgePageKind {
  return value === 'source' || value === 'entity' || value === 'topic' || value === 'query';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSingleLine(value: string | undefined): string {
  return value?.trim().replace(/\s+/gu, ' ') ?? '';
}
