import { createChangeSet, type ChangeSet } from '../../domain/change-set.js';
import { createKnowledgePage, type KnowledgePage } from '../../domain/knowledge-page.js';
import { createRequestRun } from '../../domain/request-run.js';
import { evaluateReviewGate, type ReviewGateDecision } from '../../policies/review-gate.js';
import { appendWikiLog, rewriteWikiIndex } from '../wiki/maintain-wiki-navigation.js';
import { loadKnowledgePage, saveKnowledgePage, type LoadedKnowledgePage } from '../../storage/knowledge-page-store.js';
import { saveRequestRunState } from '../../storage/request-run-state-store.js';
import { loadSourceManifest } from '../../storage/source-manifest-store.js';
import { syncReviewTask } from '../review/sync-review-task.js';
import { readRawDocument } from './read-raw-document.js';

export interface RunIngestFlowInput {
  runId: string;
  userRequest: string;
  sourceId: string;
}

export interface RunIngestFlowResult {
  changeSet: ChangeSet;
  review: ReviewGateDecision;
  persisted: string[];
}

export async function runIngestFlow(root: string, input: RunIngestFlowInput): Promise<RunIngestFlowResult> {
  const manifest = await loadSourceManifest(root, input.sourceId);

  if (manifest.status !== 'accepted') {
    throw new Error(`Invalid ingest source: ${manifest.id} is not accepted`);
  }

  const rawBody = await readRawDocument(root, manifest.path);
  const topicSlug = slugify(manifest.title);
  const sourcePath = `wiki/sources/${manifest.id}.md`;
  const topicPath = `wiki/topics/${topicSlug}.md`;
  const summary = summarize(rawBody);
  const tags = deriveTags(manifest.title, rawBody);
  const sourcePage = createKnowledgePage({
    path: sourcePath,
    kind: 'source',
    title: manifest.title,
    summary,
    tags,
    source_refs: [manifest.path],
    outgoing_links: [topicPath],
    status: 'active',
    updated_at: manifest.imported_at
  });
  const topicPage = createKnowledgePage({
    path: topicPath,
    kind: 'topic',
    title: manifest.title,
    summary,
    tags,
    source_refs: [manifest.path],
    outgoing_links: [],
    status: 'active',
    updated_at: manifest.imported_at
  });
  const sourceBody = renderSourceBody(manifest.title, manifest.path, rawBody);
  const topicBody = renderTopicBody(manifest.title, summary);
  const existingSource = await loadPageIfExists(root, 'source', manifest.id);
  const existingTopic = await loadPageIfExists(root, 'topic', topicSlug);
  const sourceChanged = hasPageChanged(existingSource, sourcePage, sourceBody);
  const topicChanged = hasPageChanged(existingTopic, topicPage, topicBody);
  const rewritesCoreTopic =
    existingTopic !== null && topicChanged && !sameStringArray(existingTopic.page.source_refs, [manifest.path]);

  const changedTargets: string[] = [];

  if (sourceChanged) {
    changedTargets.push(sourcePath);
  }

  if (topicChanged) {
    changedTargets.push(topicPath);
  }

  const writesNavigation = changedTargets.length > 0;

  if (writesNavigation) {
    changedTargets.push('wiki/index.md', 'wiki/log.md');
  }

  const changeSet = createChangeSet({
    target_files: changedTargets,
    patch_summary:
      changedTargets.length === 0
        ? 'no wiki changes required'
        : rewritesCoreTopic
          ? 'rewrite existing multi-source topic page'
          : 'apply accepted source patch',
    rationale: `ingest accepted source ${manifest.id}`,
    source_refs: [manifest.path],
    risk_level: rewritesCoreTopic ? 'high' : 'low',
    needs_review: rewritesCoreTopic
  });
  const review = evaluateReviewGate(changeSet, {
    rewritesCoreTopic
  });

  if (review.needs_review || changedTargets.length === 0) {
    await persistRunState(root, input, manifest.path, changeSet, review, []);

    return {
      changeSet,
      review,
      persisted: []
    };
  }

  const persisted: string[] = [];

  if (sourceChanged) {
    await saveKnowledgePage(root, sourcePage, sourceBody);
    persisted.push(sourcePath);
  }

  if (topicChanged) {
    await saveKnowledgePage(root, topicPage, topicBody);
    persisted.push(topicPath);
  }

  if (await rewriteWikiIndex(root)) {
    persisted.push('wiki/index.md');
  }

  if (await appendWikiLog(root, `- ingested ${manifest.id} from ${manifest.path}\n`)) {
    persisted.push('wiki/log.md');
  }

  await persistRunState(root, input, manifest.path, changeSet, review, persisted);

  return {
    changeSet,
    review,
    persisted
  };
}

async function persistRunState(
  root: string,
  input: RunIngestFlowInput,
  sourceRef: string,
  changeSet: ChangeSet,
  review: ReviewGateDecision,
  touchedFiles: string[]
): Promise<void> {
  const runState = {
    request_run: createRequestRun({
      run_id: input.runId,
      user_request: input.userRequest,
      intent: 'ingest',
      plan: ['read accepted raw source', 'derive wiki patch', review.needs_review ? 'queue review gate' : 'apply patch'],
      status: review.needs_review ? 'needs_review' : 'done',
      evidence: [sourceRef],
      touched_files: touchedFiles,
      decisions: review.needs_review ? review.reasons.map((reason) => `queue review gate: ${reason}`) : ['apply low-risk patch'],
      result_summary: review.needs_review ? 'ingest requires review' : touchedFiles.length === 0 ? 'no wiki changes required' : 'ingest applied'
    }),
    tool_outcomes: [],
    draft_markdown: `# Ingest Draft\n\n- Source: ${sourceRef}\n- Files: ${changeSet.target_files.join(', ') || '_none_'}\n`,
    result_markdown: review.needs_review
      ? `# Ingest Result\n\nQueued for review: ${review.reasons.join('; ')}\n`
      : `# Ingest Result\n\nTouched files: ${touchedFiles.join(', ') || '_none_'}\n`,
    changeset: changeSet
  };

  await saveRequestRunState(root, runState);
  await syncReviewTask(root, runState);
}

async function loadPageIfExists(
  root: string,
  kind: 'source' | 'topic',
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

function sameStringArray(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function summarize(rawBody: string): string {
  return rawBody
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .join(' ')
    .trim();
}

function deriveTags(title: string, rawBody: string): string[] {
  return [...new Set(tokenize(`${title} ${rawBody}`).slice(0, 8))];
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function renderSourceBody(title: string, rawPath: string, rawBody: string): string {
  return `# ${title}\n\nSource: ${rawPath}\n\n${rawBody.trim()}\n`;
}

function renderTopicBody(title: string, summary: string): string {
  return `# ${title}\n\n${summary}\n`;
}

function slugify(value: string): string {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
}

