import { createChangeSet, type ChangeSet } from '../../domain/change-set.js';
import { createRequestRun } from '../../domain/request-run.js';
import { createSourceGroundedIngest, type SourceGroundedIngest } from '../../domain/source-grounded-ingest.js';
import type { SourceManifest } from '../../domain/source-manifest.js';
import type { ReviewGateDecision } from '../../policies/review-gate.js';
import { createGraphDatabasePool, resolveGraphDatabaseUrl } from '../../storage/graph-database.js';
import { loadProjectEnv } from '../../storage/project-env-store.js';
import { saveRequestRunState, type RequestRunState } from '../../storage/request-run-state-store.js';
import {
  findAcceptedSourceManifestByPath,
  loadSourceManifest
} from '../../storage/source-manifest-store.js';
import {
  saveSourceGroundedIngest,
  SourceGroundedIngestConflictError
} from '../../storage/save-source-grounded-ingest.js';
import { syncReviewTask } from '../review/sync-review-task.js';
import { extractSourceAnchors } from './extract-source-anchors.js';
import { readRawDocument } from './read-raw-document.js';
import { runIngestFlow } from './run-ingest-flow.js';

export interface RunSourceGroundedIngestFlowInput {
  runId: string;
  userRequest: string;
  sourceId?: string;
  sourcePath?: string;
}

export interface SourceCoverageSummary {
  total_anchor_count: number;
  covered_anchor_count: number;
  uncovered_anchor_ids: string[];
  coverage_status: 'complete' | 'partial';
}

export interface RunSourceGroundedIngestFlowResult {
  sourceId: string;
  sourcePath: string;
  topic: SourceGroundedIngest['topic'];
  sections: SourceGroundedIngest['sections'];
  evidence: SourceGroundedIngest['evidence'];
  graphTarget: string;
  coverage: SourceCoverageSummary;
  changeSet: ChangeSet;
  review: ReviewGateDecision;
  persisted: string[];
}

export async function runSourceGroundedIngestFlow(
  root: string,
  input: RunSourceGroundedIngestFlowInput
): Promise<RunSourceGroundedIngestFlowResult> {
  const manifest = await resolveAcceptedManifest(root, input);
  const compatibilityRunId = `${input.runId}--compat-ingest`;
  const compatibilityResult = await runIngestFlow(root, {
    runId: compatibilityRunId,
    userRequest: input.userRequest,
    sourceId: manifest.id
  });
  const rawBody = await readRawDocument(root, manifest.path);
  const anchors = extractSourceAnchors({
    sourceId: manifest.id,
    sourcePath: manifest.path,
    markdown: rawBody
  });

  if (anchors.length === 0) {
    throw new Error(`Source-grounded ingest requires at least one anchor: ${manifest.path}`);
  }

  const ingest = buildSourceGroundedIngest(manifest, anchors, rawBody);
  const graphTarget = buildGraphTarget(ingest.topic.slug);
  const coverage = summarizeCoverage(ingest);
  let review: ReviewGateDecision = compatibilityResult.review;
  let conflictReason: string | null = null;
  let graphWriteStatus: 'written' | 'conflict' = 'written';

  try {
    const client = await getGraphClient(root);
    await saveSourceGroundedIngest(client, ingest);
  } catch (error: unknown) {
    if (error instanceof SourceGroundedIngestConflictError) {
      conflictReason = error.message;
      graphWriteStatus = 'conflict';
      review = {
        needs_review: true,
        reasons: [error.message]
      };
    } else {
      throw error;
    }
  }

  const changeSet = createChangeSet({
    target_files: [...compatibilityResult.changeSet.target_files],
    patch_summary: review.needs_review
      ? `graph conflict on ${graphTarget}: ${conflictReason ?? review.reasons.join('; ')}`
      : `persisted source-grounded graph to ${graphTarget}`,
    rationale: `source-grounded ingest ${manifest.id}`,
    source_refs: [manifest.path],
    risk_level: review.needs_review ? 'medium' : compatibilityResult.changeSet.risk_level,
    needs_review: review.needs_review
  });
  const runState = buildRunState(
    input,
    ingest,
    manifest.path,
    compatibilityResult.persisted,
    changeSet,
    review,
    coverage,
    graphTarget,
    graphWriteStatus,
    conflictReason
  );

  await saveRequestRunState(root, runState);
  await syncReviewTask(root, runState);

  return {
    sourceId: manifest.id,
    sourcePath: manifest.path,
    topic: ingest.topic,
    sections: ingest.sections,
    evidence: ingest.evidence,
    graphTarget,
    coverage,
    changeSet,
    review,
    persisted: compatibilityResult.persisted
  };
}

async function resolveAcceptedManifest(root: string, input: RunSourceGroundedIngestFlowInput): Promise<SourceManifest> {
  const hasSourceId = typeof input.sourceId === 'string';
  const hasSourcePath = typeof input.sourcePath === 'string';

  if (hasSourceId === hasSourcePath) {
    throw new Error('Invalid source locator: provide exactly one of sourceId or sourcePath');
  }

  const manifest = hasSourceId
    ? await loadSourceManifest(root, input.sourceId as string)
    : await findAcceptedSourceManifestByPath(root, input.sourcePath as string);

  if (manifest.status !== 'accepted') {
    throw new Error(`Invalid source-grounded ingest target: ${manifest.id} is ${manifest.status}, expected accepted`);
  }

  return manifest;
}

function buildSourceGroundedIngest(
  manifest: SourceManifest,
  anchors: SourceGroundedIngest['evidence'],
  rawBody: string
): SourceGroundedIngest {
  const topicSlug = `${normalizeTitleToSlug(manifest.title)}--${manifest.id}`;
  const sections = buildSections(topicSlug, manifest.title, anchors);

  return createSourceGroundedIngest({
    sourceId: manifest.id,
    sourcePath: manifest.path,
    topic: {
      slug: topicSlug,
      title: manifest.title,
      summary: summarizeText(rawBody, 280)
    },
    sections,
    evidence: anchors
  });
}

function buildSections(
  topicSlug: string,
  sourceTitle: string,
  anchors: SourceGroundedIngest['evidence']
): SourceGroundedIngest['sections'] {
  const groups = new Map<string, SourceGroundedIngest['evidence']>();

  for (const anchor of anchors) {
    const groupKey = anchor.heading_path.join(' > ');
    const current = groups.get(groupKey);

    if (current) {
      current.push(anchor);
      continue;
    }

    groups.set(groupKey, [anchor]);
  }

  return [...groups.values()].map((group, index) => {
    const title = deriveSectionTitle(group[0], sourceTitle);
    const sectionOrder = index + 1;

    return {
      id: `section:${topicSlug}#${sectionOrder}`,
      title,
      summary: summarizeText(group.map((anchor) => anchor.excerpt).join(' '), 240),
      grounded_evidence_ids: group.map((anchor) => anchor.id)
    };
  });
}

function summarizeCoverage(ingest: SourceGroundedIngest): SourceCoverageSummary {
  const coveredAnchorIds = new Set(ingest.sections.flatMap((section) => section.grounded_evidence_ids));
  const uncoveredAnchorIds = ingest.evidence
    .filter((anchor) => !coveredAnchorIds.has(anchor.id))
    .map((anchor) => anchor.id);

  return {
    total_anchor_count: ingest.evidence.length,
    covered_anchor_count: coveredAnchorIds.size,
    uncovered_anchor_ids: uncoveredAnchorIds,
    coverage_status: uncoveredAnchorIds.length === 0 ? 'complete' : 'partial'
  };
}

function buildRunState(
  input: RunSourceGroundedIngestFlowInput,
  ingest: SourceGroundedIngest,
  sourcePath: string,
  touchedFiles: string[],
  changeSet: ChangeSet,
  review: ReviewGateDecision,
  coverage: SourceCoverageSummary,
  graphTarget: string,
  graphWriteStatus: 'written' | 'conflict',
  conflictReason: string | null
): RequestRunState {
  const resultSummary = review.needs_review
    ? `source-grounded ingest queued for review because of graph conflict on ${graphTarget}`
    : `persisted source-grounded graph to ${graphTarget} with ${ingest.sections.length} sections`;
  const data = {
    graphWrite: {
      status: graphWriteStatus,
      graphTarget,
      topicId: ingest.topic.id,
      sectionCount: ingest.sections.length
    },
    sourceCoverage: coverage,
    ...(conflictReason === null ? {} : { conflictReason })
  };
  const decisions = review.needs_review
    ? [
        `graph conflict on ${graphTarget}`,
        ...review.reasons.map((reason) => `queue review gate: ${reason}`)
      ]
    : [`persist graph target ${graphTarget} with ${ingest.sections.length} sections`];

  return {
    request_run: createRequestRun({
      run_id: input.runId,
      user_request: input.userRequest,
      intent: 'ingest',
      plan: [
        'refresh source-page compatibility ingest',
        'extract source anchors',
        'build source-grounded topic and sections',
        review.needs_review ? 'queue review gate' : 'persist source-grounded graph'
      ],
      status: review.needs_review ? 'needs_review' : 'done',
      evidence: [sourcePath],
      touched_files: touchedFiles,
      decisions,
      result_summary: resultSummary
    }),
    tool_outcomes: [],
    events: [
      {
        type: 'run_completed',
        timestamp: new Date().toISOString(),
        summary: resultSummary,
        status: review.needs_review ? 'needs_review' : 'done',
        evidence: [sourcePath],
        touched_files: touchedFiles,
        data
      }
    ],
    timeline_items: [],
    draft_markdown: renderDraftMarkdown(sourcePath, ingest, touchedFiles),
    result_markdown: renderResultMarkdown(sourcePath, ingest, touchedFiles, coverage, graphTarget, review, conflictReason),
    changeset: changeSet
  };
}

async function getGraphClient(root: string) {
  const projectEnv = await loadProjectEnv(root);
  const databaseUrl = resolveGraphDatabaseUrl(projectEnv.contents);

  return createGraphDatabasePool(databaseUrl);
}

function renderDraftMarkdown(sourcePath: string, ingest: SourceGroundedIngest, touchedFiles: string[]): string {
  return [
    '# Source-grounded Ingest Draft',
    '',
    `- Source: ${sourcePath}`,
    `- Topic: ${ingest.topic.id}`,
    `- Sections: ${ingest.sections.length}`,
    `- Compatibility files: ${touchedFiles.join(', ') || '_none_'}`,
    ''
  ].join('\n');
}

function renderResultMarkdown(
  sourcePath: string,
  ingest: SourceGroundedIngest,
  touchedFiles: string[],
  coverage: SourceCoverageSummary,
  graphTarget: string,
  review: ReviewGateDecision,
  conflictReason: string | null
): string {
  const lines = [
    '# Source-grounded Ingest Result',
    '',
    `Topic id: ${ingest.topic.id}`,
    `Graph target: ${graphTarget}`,
    `Sections: ${ingest.sections.length}`,
    `Source: ${sourcePath}`,
    `Compatibility files: ${touchedFiles.join(', ') || '_none_'}`,
    `Coverage status: ${coverage.coverage_status}`,
    `Covered anchors: ${coverage.covered_anchor_count}/${coverage.total_anchor_count}`
  ];

  if (coverage.uncovered_anchor_ids.length > 0) {
    lines.push(`Uncovered anchors: ${coverage.uncovered_anchor_ids.join(', ')}`);
  }

  if (review.needs_review) {
    lines.push(`Queued for review: ${conflictReason ?? review.reasons.join('; ')}`);
    lines.push(`Graph conflict: ${conflictReason ?? review.reasons.join('; ')}`);
  }

  lines.push('');
  return lines.join('\n');
}

function buildGraphTarget(slug: string): string {
  return `graph:topic:${slug}`;
}

function deriveSectionTitle(anchor: SourceGroundedIngest['evidence'][number] | undefined, sourceTitle: string): string {
  const title = anchor?.heading_path.at(-1) ?? '';

  return title === '' || title === 'Document' ? sourceTitle : title;
}

function summarizeText(value: string, maxLength: number): string {
  const summary = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return summary.slice(0, maxLength).trim() || '_empty_';
}

function normalizeTitleToSlug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'source';
}
