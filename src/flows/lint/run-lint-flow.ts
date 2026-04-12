import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectPaths } from '../../config/project-paths.js';
import { createChangeSet } from '../../domain/change-set.js';
import { createFinding, type Finding, type FindingType } from '../../domain/finding.js';
import { createRequestRun } from '../../domain/request-run.js';
import { loadKnowledgePage } from '../../storage/knowledge-page-store.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';
import { saveRequestRunState } from '../../storage/request-run-state-store.js';

export interface RunLintFlowInput {
  runId: string;
  userRequest: string;
  autoFix: boolean;
}

export interface RunLintFlowResult {
  findings: Finding[];
  autoFixed: string[];
  reviewCandidates: Finding[];
}

export async function runLintFlow(root: string, input: RunLintFlowInput): Promise<RunLintFlowResult> {
  const pages = await collectPages(root);
  const pagePaths = new Set(pages.map((page) => page.page.path));
  const incomingCounts = new Map<string, number>();
  const findings: Finding[] = [];

  for (const loaded of pages) {
    for (const outgoing of loaded.page.outgoing_links) {
      incomingCounts.set(outgoing, (incomingCounts.get(outgoing) ?? 0) + 1);

      if (!pagePaths.has(outgoing)) {
        findings.push(
          createFinding({
            type: 'missing-link',
            severity: 'medium',
            evidence: [`${loaded.page.path} -> ${outgoing}`],
            suggested_action: 'remove or replace the missing outgoing link',
            resolution_status: 'open'
          })
        );
      }
    }
  }

  for (const loaded of pages) {
    if (loaded.body.includes('Conflict:')) {
      findings.push(
        createFinding({
          type: 'conflict',
          severity: 'high',
          evidence: [loaded.page.path],
          suggested_action: 'review the conflicting evidence before changing the page',
          resolution_status: 'open'
        })
      );
    }

    if (loaded.page.source_refs.length === 0) {
      findings.push(
        createFinding({
          type: 'gap',
          severity: 'high',
          evidence: [loaded.page.path],
          suggested_action: 'add supporting source references or remove the unsupported conclusion',
          resolution_status: 'open'
        })
      );
    }

    if (loaded.page.status === 'stale') {
      findings.push(
        createFinding({
          type: 'stale',
          severity: 'medium',
          evidence: [loaded.page.path],
          suggested_action: 'refresh the page against current evidence',
          resolution_status: 'open'
        })
      );
    }

    if (loaded.page.kind !== 'source' && (incomingCounts.get(loaded.page.path) ?? 0) === 0) {
      findings.push(
        createFinding({
          type: 'orphan',
          severity: 'low',
          evidence: [loaded.page.path],
          suggested_action: 'link the page from another wiki page if it should stay discoverable',
          resolution_status: 'open'
        })
      );
    }
  }

  const sortedFindings = sortFindings(findings);
  const reviewCandidates = sortedFindings.filter((finding) => finding.severity === 'high');
  const autoFixed: string[] = [];

  if (input.autoFix && (await rewriteWikiIndex(root))) {
    autoFixed.push('wiki/index.md');
  }

  await saveRequestRunState(root, {
    request_run: createRequestRun({
      run_id: input.runId,
      user_request: input.userRequest,
      intent: 'lint',
      plan: ['scan wiki pages', input.autoFix ? 'rewrite wiki index' : 'skip auto-fix', 'record findings'],
      status: 'done',
      evidence: sortedFindings.flatMap((finding) => finding.evidence),
      touched_files: autoFixed,
      decisions: reviewCandidates.length === 0 ? ['no review candidates'] : ['record high-risk review candidates'],
      result_summary: `${sortedFindings.length} finding(s), ${reviewCandidates.length} review candidate(s)`
    }),
    draft_markdown: `# Lint Draft\n\n- Findings: ${sortedFindings.length}\n- Auto-fixed: ${autoFixed.join(', ') || '_none_'}\n`,
    result_markdown: `# Lint Result\n\nReview candidates: ${reviewCandidates.length}\n`,
    changeset:
      autoFixed.length === 0
        ? null
        : createChangeSet({
            target_files: autoFixed,
            patch_summary: 'rebuild wiki index from current page set',
            rationale: 'low-risk lint auto-fix to keep navigation structured',
            source_refs: [],
            risk_level: 'low'
          })
  });

  return {
    findings: sortedFindings,
    autoFixed,
    reviewCandidates
  };
}

async function collectPages(root: string) {
  const pages = [] as Array<Awaited<ReturnType<typeof loadKnowledgePage>>>;

  for (const kind of ['source', 'entity', 'topic', 'query'] as const) {
    for (const slug of await listKnowledgePages(root, kind)) {
      pages.push(await loadKnowledgePage(root, kind, slug));
    }
  }

  return pages;
}

async function rewriteWikiIndex(root: string): Promise<boolean> {
  const paths = buildProjectPaths(root);
  const sources = await listKnowledgePages(root, 'source');
  const entities = await listKnowledgePages(root, 'entity');
  const topics = await listKnowledgePages(root, 'topic');
  const queries = await listKnowledgePages(root, 'query');
  const content = `# Wiki Index\n\n## Sources\n${renderSection('sources', sources)}\n## Entities\n${renderSection('entities', entities)}\n## Topics\n${renderSection('topics', topics)}\n## Queries\n${renderSection('queries', queries)}`;

  await mkdir(path.dirname(paths.wikiIndex), { recursive: true });

  try {
    if ((await readFile(paths.wikiIndex, 'utf8')) === content) {
      return false;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await writeFile(paths.wikiIndex, content, 'utf8');
  return true;
}

function renderSection(directory: string, slugs: string[]): string {
  if (slugs.length === 0) {
    return '- _None_\n';
  }

  return `${slugs.map((slug) => `- [${slug}](${directory}/${slug}.md)`).join('\n')}\n`;
}

function sortFindings(findings: Finding[]): Finding[] {
  const severityRank = new Map<string, number>([
    ['high', 0],
    ['medium', 1],
    ['low', 2]
  ]);
  const typeRank = new Map<FindingType, number>([
    ['conflict', 0],
    ['gap', 1],
    ['stale', 2],
    ['missing-link', 3],
    ['orphan', 4]
  ]);

  return [...findings].sort((a, b) => {
    return (
      (severityRank.get(a.severity) ?? 99) - (severityRank.get(b.severity) ?? 99) ||
      (typeRank.get(a.type) ?? 99) - (typeRank.get(b.type) ?? 99) ||
      a.evidence.join('|').localeCompare(b.evidence.join('|'))
    );
  });
}
