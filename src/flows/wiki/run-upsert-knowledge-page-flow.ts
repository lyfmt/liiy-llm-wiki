import { createChangeSet, type ChangeSet } from '../../domain/change-set.js';
import { createKnowledgePage, type KnowledgePage, type KnowledgePageKind } from '../../domain/knowledge-page.js';
import { createRequestRun } from '../../domain/request-run.js';
import { evaluateReviewGate, type ReviewGateDecision } from '../../policies/review-gate.js';
import { loadKnowledgePage, saveKnowledgePage, type LoadedKnowledgePage } from '../../storage/knowledge-page-store.js';
import { saveRequestRunState } from '../../storage/request-run-state-store.js';
import { syncReviewTask } from '../review/sync-review-task.js';
import { appendWikiLog, rewriteWikiIndex } from './maintain-wiki-navigation.js';

export interface RunUpsertKnowledgePageFlowInput {
  runId: string;
  userRequest: string;
  kind: KnowledgePageKind;
  slug: string;
  title: string;
  aliases?: string[];
  summary?: string;
  tags?: string[];
  source_refs: string[];
  outgoing_links?: string[];
  status: string;
  updated_at: string;
  body: string;
  rationale: string;
}

export interface RunUpsertKnowledgePageFlowResult {
  page: KnowledgePage;
  changeSet: ChangeSet;
  review: ReviewGateDecision;
  persisted: string[];
}

export async function runUpsertKnowledgePageFlow(
  root: string,
  input: RunUpsertKnowledgePageFlowInput
): Promise<RunUpsertKnowledgePageFlowResult> {
  const pagePath = `wiki/${directoryNameForKind(input.kind)}/${input.slug}.md`;
  const page = createKnowledgePage({
    path: pagePath,
    kind: input.kind,
    title: input.title,
    aliases: input.aliases,
    summary: input.summary,
    tags: input.tags,
    source_refs: input.source_refs,
    outgoing_links: input.outgoing_links,
    status: input.status,
    updated_at: input.updated_at
  });
  const normalizedBody = normalizeBody(input.body, input.title);
  const existingPage = await loadPageIfExists(root, input.kind, input.slug);
  const pageChanged = hasPageChanged(existingPage, page, normalizedBody);
  const changedTargets = pageChanged ? [pagePath, 'wiki/index.md', 'wiki/log.md'] : [];
  const reviewSignals = deriveReviewSignals(existingPage, page, normalizedBody);
  const changeSet = createChangeSet({
    target_files: changedTargets,
    patch_summary: pageChanged ? `upsert ${page.kind} page ${page.path}` : 'no wiki changes required',
    rationale: input.rationale,
    source_refs: [...page.source_refs],
    risk_level: reviewSignals.rewritesCoreTopic ? 'high' : page.kind === 'topic' ? 'medium' : 'low',
    needs_review: false
  });
  const review = evaluateReviewGate(changeSet, reviewSignals);

  if (review.needs_review || !pageChanged) {
    await persistRunState(root, input, page, changeSet, review, []);

    return {
      page,
      changeSet,
      review,
      persisted: []
    };
  }

  const persisted: string[] = [];
  await saveKnowledgePage(root, page, normalizedBody);
  persisted.push(pagePath);

  if (await rewriteWikiIndex(root)) {
    persisted.push('wiki/index.md');
  }

  if (await appendWikiLog(root, `- upserted ${page.kind} ${page.path}: ${input.rationale}\n`)) {
    persisted.push('wiki/log.md');
  }

  await persistRunState(root, input, page, changeSet, review, persisted);

  return {
    page,
    changeSet,
    review,
    persisted
  };
}

async function persistRunState(
  root: string,
  input: RunUpsertKnowledgePageFlowInput,
  page: KnowledgePage,
  changeSet: ChangeSet,
  review: ReviewGateDecision,
  touchedFiles: string[]
): Promise<void> {
  const runState = {
    request_run: createRequestRun({
      run_id: input.runId,
      user_request: input.userRequest,
      intent: 'mixed',
      plan: ['inspect existing wiki page state', 'derive governed page upsert changeset', review.needs_review ? 'queue review gate' : 'apply page upsert'],
      status: review.needs_review ? 'needs_review' : 'done',
      evidence: [page.path, ...page.source_refs],
      touched_files: touchedFiles,
      decisions: review.needs_review ? review.reasons.map((reason) => `queue review gate: ${reason}`) : ['apply governed page upsert'],
      result_summary: review.needs_review ? 'page upsert requires review' : touchedFiles.length === 0 ? 'no wiki changes required' : 'page upsert applied'
    }),
    tool_outcomes: [],
    draft_markdown: renderPageUpsertDraft(input, page, changeSet),
    result_markdown: review.needs_review
      ? `# Page Upsert Result\n\nQueued for review: ${review.reasons.join('; ')}\n`
      : `# Page Upsert Result\n\nTouched files: ${touchedFiles.join(', ') || '_none_'}\n`,
    changeset: changeSet
  };

  await saveRequestRunState(root, runState);
  await syncReviewTask(root, runState);
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

function deriveReviewSignals(
  existing: LoadedKnowledgePage | null,
  page: KnowledgePage,
  body: string
): NonNullable<Parameters<typeof evaluateReviewGate>[1]> {
  return {
    rewritesCoreTopic:
      page.kind === 'topic' &&
      existing !== null &&
      hasPageChanged(existing, page, body) &&
      !sameStringArray(existing.page.source_refs, page.source_refs),
    unresolvedConflict: body.includes('Conflict:')
  };
}

function normalizeBody(body: string, title: string): string {
  const trimmed = body.trim();

  return trimmed.length === 0 ? `# ${title}\n` : `${trimmed}\n`;
}

function renderPageUpsertDraft(
  input: RunUpsertKnowledgePageFlowInput,
  page: KnowledgePage,
  changeSet: ChangeSet
): string {
  return [
    '# Page Upsert Draft',
    '',
    `- Target: ${page.path}`,
    `- Kind: ${page.kind}`,
    `- Title: ${page.title}`,
    `- Rationale: ${input.rationale}`,
    `- Source refs: ${page.source_refs.join(', ') || '_none_'}`,
    `- Outgoing links: ${page.outgoing_links.join(', ') || '_none_'}`,
    `- Files: ${changeSet.target_files.join(', ') || '_none_'}`,
    '',
    '## Proposed Body',
    input.body.trim() || `_empty_`,
    ''
  ].join('\n');
}

function sameStringArray(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function directoryNameForKind(kind: KnowledgePageKind): string {
  return kind === 'source'
    ? 'sources'
    : kind === 'entity'
      ? 'entities'
      : kind === 'query'
        ? 'queries'
        : 'topics';
}
