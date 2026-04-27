import { createKnowledgePage, type KnowledgePageKind } from '../../domain/knowledge-page.js';
import { createChangeSet, type ChangeSet } from '../../domain/change-set.js';
import { evaluateReviewGate, type ReviewGateDecision } from '../../policies/review-gate.js';
import { readRawDocument } from '../ingest/read-raw-document.js';
import { loadKnowledgePage, saveKnowledgePage, type LoadedKnowledgePage } from '../../storage/knowledge-page-store.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';

export interface QueryWikiEvidence {
  path: string;
  kind: KnowledgePageKind;
  title: string;
  summary: string;
  bodyExcerpt: string;
  sourceRefs: string[];
  outgoingLinks: string[];
  matchReasons: string[];
}

export interface RawEvidence {
  path: string;
  excerpt: string;
}

export interface QueryAnswerSynthesisInput {
  question: string;
  wikiEvidence: QueryWikiEvidence[];
  rawEvidence: RawEvidence[];
}

export interface QueryAnswerSynthesisResult {
  answer: string;
  mode?: 'llm' | 'deterministic';
}

export type QueryAnswerSynthesizer = (
  input: QueryAnswerSynthesisInput
) => Promise<QueryAnswerSynthesisResult>;

export interface RunQueryFlowInput {
  question: string;
  persistQueryPage: boolean;
  synthesizeAnswer?: QueryAnswerSynthesizer;
}

export interface RunQueryFlowResult {
  answer: string;
  sources: string[];
  rawSources: string[];
  rawEvidence: RawEvidence[];
  wikiEvidence: QueryWikiEvidence[];
  synthesisMode: 'llm' | 'deterministic' | 'none';
  synthesisFallbackReason: string | null;
  persistedQueryPage: string | null;
  changeSet: ChangeSet | null;
  review: ReviewGateDecision;
}

interface QueryEvidence {
  loaded: LoadedKnowledgePage;
  score: number;
  matchReasons: string[];
}

export async function runQueryFlow(root: string, input: RunQueryFlowInput): Promise<RunQueryFlowResult> {
  const slug = slugifyQuestion(input.question);

  if (input.persistQueryPage && slug === '') {
    throw new Error('Invalid query question: cannot derive query slug');
  }

  const pages = await collectPages(root, ['source', 'entity', 'taxonomy', 'topic', 'query']);
  const selectedEvidence = selectNavigationEvidence(input.question, pages);

  if (selectedEvidence.length === 0) {
    return {
      answer: 'No relevant wiki pages found.',
      sources: [],
      rawSources: [],
      rawEvidence: [],
      wikiEvidence: [],
      synthesisMode: 'none',
      synthesisFallbackReason: null,
      persistedQueryPage: null,
      changeSet: null,
      review: {
        needs_review: false,
        reasons: []
      }
    };
  }

  const wikiSources = uniqueStrings(selectedEvidence.map((item) => item.loaded.page.path));
  const rawEvidence = await collectRawEvidence(root, selectedEvidence);
  const rawSources = rawEvidence.map((item) => item.path);
  const wikiEvidence = buildWikiEvidence(selectedEvidence);
  let answer = buildDeterministicAnswer(selectedEvidence, rawEvidence);
  let synthesisMode: RunQueryFlowResult['synthesisMode'] = 'deterministic';
  let synthesisFallbackReason: string | null = null;

  if (input.synthesizeAnswer !== undefined) {
    try {
      const synthesis = await input.synthesizeAnswer({
        question: input.question,
        wikiEvidence,
        rawEvidence
      });
      const synthesizedAnswer = synthesis.answer.trim();

      if (synthesizedAnswer.length === 0) {
        synthesisFallbackReason = 'query synthesizer returned an empty answer';
      } else {
        answer = synthesizedAnswer;
        synthesisMode = synthesis.mode ?? 'llm';
      }
    } catch (error: unknown) {
      synthesisFallbackReason = error instanceof Error ? error.message : String(error);
    }
  }

  let persistedQueryPage: string | null = null;
  let changeSet: ChangeSet | null = null;
  let review: ReviewGateDecision = {
    needs_review: false,
    reasons: []
  };

  if (input.persistQueryPage) {
    const title = titleizeQuestion(input.question);
    const queryPath = `wiki/queries/${slug}.md`;
    const sourceRefs = uniqueStrings([
      ...selectedEvidence.flatMap((item) => item.loaded.page.source_refs),
      ...rawSources
    ]);
    const outgoingLinks = uniqueStrings(selectedEvidence.map((item) => item.loaded.page.path));
    const tags = uniqueStrings(selectedEvidence.flatMap((item) => item.loaded.page.tags));
    const summary = summarizePersistedQuery(selectedEvidence, answer);
    const body = renderQueryBody(input.question, answer, selectedEvidence, rawEvidence);
    const page = createKnowledgePage({
      path: queryPath,
      kind: 'query',
      title,
      summary,
      tags,
      source_refs: sourceRefs,
      outgoing_links: outgoingLinks,
      status: 'active',
      updated_at: new Date().toISOString()
    });
    const existingQuery = await loadPageIfExists(root, 'query', slug);
    const queryChanged = hasPageChanged(existingQuery, page, body);

    if (queryChanged) {
      changeSet = createChangeSet({
        target_files: [queryPath],
        patch_summary: 'persist query page with traced wiki and raw evidence',
        rationale: `capture durable answer for query: ${input.question}`,
        source_refs: sourceRefs,
        risk_level: selectedEvidence.some((item) => item.loaded.page.kind === 'topic') ? 'medium' : 'low',
        needs_review: false
      });
      review = evaluateReviewGate(changeSet, {
        unresolvedConflict: selectedEvidence.some((item) => item.loaded.body.includes('Conflict:'))
      });

      if (!review.needs_review) {
        await saveKnowledgePage(root, page, body);
        persistedQueryPage = queryPath;
      }
    }
  }

  return {
    answer,
    sources: wikiSources,
    rawSources,
    rawEvidence,
    wikiEvidence,
    synthesisMode,
    synthesisFallbackReason,
    persistedQueryPage,
    changeSet,
    review
  };
}

async function collectPages(root: string, kinds: KnowledgePageKind[]) {
  const pages = [] as Array<LoadedKnowledgePage>;

  for (const kind of kinds) {
    for (const slug of await listKnowledgePages(root, kind)) {
      pages.push(await loadKnowledgePage(root, kind, slug));
    }
  }

  return pages;
}

function selectNavigationEvidence(question: string, pages: LoadedKnowledgePage[]): QueryEvidence[] {
  const scoredPages = scorePages(question, pages);
  const rankedSeeds = scoredPages.filter((item) => item.score > 0).sort(compareQueryEvidence);

  if (rankedSeeds.length === 0) {
    return [];
  }

  const pageMap = new Map(scoredPages.map((item) => [item.loaded.page.path, item]));
  const incomingLinkMap = buildIncomingLinkMap(pages);
  const sourceRefIndex = buildSourceRefIndex(pages);
  const selected: QueryEvidence[] = [];
  const visited = new Set<string>();
  const queue: QueryEvidence[] = [];

  for (const seed of rankedSeeds.slice(0, 2)) {
    enqueueEvidence(queue, seed);
  }

  while (queue.length > 0 && selected.length < 4) {
    const current = queue.shift()!;

    if (visited.has(current.loaded.page.path)) {
      continue;
    }

    visited.add(current.loaded.page.path);
    selected.push(current);

    for (const related of buildRelatedEvidence(current, pageMap, incomingLinkMap, sourceRefIndex)) {
      if (visited.has(related.loaded.page.path)) {
        continue;
      }

      enqueueEvidence(queue, related);
    }
  }

  for (const candidate of rankedSeeds) {
    if (selected.length >= 4) {
      break;
    }

    if (visited.has(candidate.loaded.page.path)) {
      continue;
    }

    visited.add(candidate.loaded.page.path);
    selected.push(candidate);
  }

  return selected.sort(compareQueryEvidence);
}

function scorePages(question: string, pages: LoadedKnowledgePage[]): QueryEvidence[] {
  const questionTokens = tokenize(question);

  return pages.map((loaded) => {
    const pathTokens = tokenize(loaded.page.path);
    const titleTokens = tokenize(loaded.page.title);
    const aliasTokens = tokenize(loaded.page.aliases.join(' '));
    const summaryTokens = tokenize(loaded.page.summary);
    const tagTokens = tokenize(loaded.page.tags.join(' '));
    const bodyTokens = tokenize(loaded.body);
    const linkTokens = tokenize(loaded.page.outgoing_links.join(' '));
    const matchReasons: string[] = [];
    let score = 0;

    for (const token of questionTokens) {
      if (titleTokens.includes(token)) {
        score += 5;
        matchReasons.push(`title:${token}`);
      }

      if (aliasTokens.includes(token)) {
        score += 3;
        matchReasons.push(`alias:${token}`);
      }

      if (summaryTokens.includes(token)) {
        score += 4;
        matchReasons.push(`summary:${token}`);
      }

      if (pathTokens.includes(token)) {
        score += 2;
        matchReasons.push(`path:${token}`);
      }

      if (tagTokens.includes(token)) {
        score += 2;
        matchReasons.push(`tag:${token}`);
      }

      if (bodyTokens.includes(token)) {
        score += 1;
        matchReasons.push(`body:${token}`);
      }

      if (linkTokens.includes(token)) {
        score += 1;
        matchReasons.push(`link:${token}`);
      }
    }

    if (score > 0 && loaded.page.kind === 'topic') {
      score += 2;
    }

    return {
      loaded,
      score,
      matchReasons: uniqueStrings(matchReasons)
    };
  });
}

function buildRelatedEvidence(
  current: QueryEvidence,
  pageMap: Map<string, QueryEvidence>,
  incomingLinkMap: Map<string, string[]>,
  sourceRefIndex: Map<string, string[]>
): QueryEvidence[] {
  const related: QueryEvidence[] = [];

  for (const link of current.loaded.page.outgoing_links) {
    const linked = pageMap.get(link);

    if (!linked) {
      continue;
    }

    related.push(enrichEvidence(linked, 2, `navigated-from:${current.loaded.page.path}`));
  }

  for (const backlink of incomingLinkMap.get(current.loaded.page.path) ?? []) {
    const linked = pageMap.get(backlink);

    if (!linked) {
      continue;
    }

    related.push(enrichEvidence(linked, 2, `links-to:${current.loaded.page.path}`));
  }

  for (const sourceRef of current.loaded.page.source_refs) {
    for (const relatedPath of sourceRefIndex.get(sourceRef) ?? []) {
      if (relatedPath === current.loaded.page.path) {
        continue;
      }

      const linked = pageMap.get(relatedPath);

      if (!linked) {
        continue;
      }

      related.push(enrichEvidence(linked, 1, `shared-source:${sourceRef}`));
    }
  }

  return related;
}

function enrichEvidence(base: QueryEvidence, bonus: number, reason: string): QueryEvidence {
  return {
    loaded: base.loaded,
    score: base.score + bonus,
    matchReasons: uniqueStrings([...base.matchReasons, reason])
  };
}

function enqueueEvidence(queue: QueryEvidence[], candidate: QueryEvidence): void {
  const existingIndex = queue.findIndex((entry) => entry.loaded.page.path === candidate.loaded.page.path);

  if (existingIndex >= 0) {
    const existing = queue[existingIndex]!;
    queue[existingIndex] = {
      loaded: existing.loaded,
      score: Math.max(existing.score, candidate.score),
      matchReasons: uniqueStrings([...existing.matchReasons, ...candidate.matchReasons])
    };
  } else {
    queue.push(candidate);
  }

  queue.sort(compareQueryEvidence);
}

function compareQueryEvidence(left: QueryEvidence, right: QueryEvidence): number {
  return right.score - left.score || left.loaded.page.path.localeCompare(right.loaded.page.path);
}

function buildIncomingLinkMap(pages: LoadedKnowledgePage[]): Map<string, string[]> {
  const incomingLinkMap = new Map<string, string[]>();

  for (const loaded of pages) {
    for (const outgoingLink of loaded.page.outgoing_links) {
      incomingLinkMap.set(outgoingLink, uniqueStrings([...(incomingLinkMap.get(outgoingLink) ?? []), loaded.page.path]));
    }
  }

  return incomingLinkMap;
}

function buildSourceRefIndex(pages: LoadedKnowledgePage[]): Map<string, string[]> {
  const sourceRefIndex = new Map<string, string[]>();

  for (const loaded of pages) {
    for (const sourceRef of loaded.page.source_refs) {
      sourceRefIndex.set(sourceRef, uniqueStrings([...(sourceRefIndex.get(sourceRef) ?? []), loaded.page.path]));
    }
  }

  return sourceRefIndex;
}

async function collectRawEvidence(root: string, evidence: QueryEvidence[]): Promise<RawEvidence[]> {
  const rawSources = uniqueStrings(evidence.flatMap((item) => item.loaded.page.source_refs).filter(isAcceptedRawPath));
  const confirmed: RawEvidence[] = [];

  for (const rawSource of rawSources) {
    try {
      const body = await readRawDocument(root, rawSource);
      confirmed.push({
        path: rawSource,
        excerpt: summarizeRawDocument(body)
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.startsWith('Missing raw document:') || message === 'Invalid raw document path') {
        continue;
      }

      throw error;
    }
  }

  return confirmed;
}

function buildWikiEvidence(evidence: QueryEvidence[]): QueryWikiEvidence[] {
  return evidence.map((item) => ({
    path: item.loaded.page.path,
    kind: item.loaded.page.kind,
    title: item.loaded.page.title,
    summary: summarizeBody(item.loaded.body) || item.loaded.page.summary,
    bodyExcerpt: summarizeBody(item.loaded.body),
    sourceRefs: [...item.loaded.page.source_refs],
    outgoingLinks: [...item.loaded.page.outgoing_links],
    matchReasons: [...item.matchReasons]
  }));
}

function buildDeterministicAnswer(evidence: QueryEvidence[], rawEvidence: RawEvidence[]): string {
  const navigationSummary = evidence
    .map((item) => {
      const page = item.loaded.page;
      const narrative = summarizeBody(item.loaded.body) || page.summary || extractAnswer(item.loaded.body);
      return `${page.title} (${page.path}): ${narrative}`;
    })
    .join(' ');

  if (rawEvidence.length === 0) {
    return navigationSummary;
  }

  const sourceSummary = rawEvidence.map((item) => `${item.path} => ${item.excerpt}`).join(' ');
  return `${navigationSummary} Source evidence: ${sourceSummary}`;
}

function renderQueryBody(question: string, answer: string, evidence: QueryEvidence[], rawEvidence: RawEvidence[]): string {
  const wikiEvidence = evidence
    .map((item) => `- ${item.loaded.page.path} (${item.loaded.page.kind}; ${item.matchReasons.join(', ') || 'matched by content'})`)
    .join('\n');
  const rawEvidenceMarkdown =
    rawEvidence.length === 0 ? '- _none_' : rawEvidence.map((item) => `- ${item.path}: ${item.excerpt}`).join('\n');

  return `# ${titleizeQuestion(question)}\n\n## Answer\n${answer}\n\n## Wiki Evidence\n${wikiEvidence}\n\n## Raw Evidence\n${rawEvidenceMarkdown}\n`;
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

function hasPageChanged(existing: LoadedKnowledgePage | null, page: LoadedKnowledgePage['page'], body: string): boolean {
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

function summarizeAnswer(answer: string): string {
  return answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .slice(0, 280);
}

function summarizePersistedQuery(evidence: QueryEvidence[], answer: string): string {
  for (const item of evidence) {
    const narrative = summarizeBody(item.loaded.body);

    if (narrative.length > 0) {
      return narrative;
    }
  }

  return summarizeAnswer(answer);
}

function extractAnswer(body: string): string {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .join(' ')
    .trim();
}

function summarizeBody(body: string): string {
  return extractAnswer(body).slice(0, 280).trim();
}

function summarizeRawDocument(body: string): string {
  const summary = extractAnswer(body).slice(0, 220).trim();
  return summary || '_empty_';
}

function slugifyQuestion(question: string): string {
  return tokenize(question).join('-');
}

function titleizeQuestion(question: string): string {
  return question
    .trim()
    .replace(/\?+$/, '')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sameStringArray(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isAcceptedRawPath(value: string): boolean {
  return value.startsWith('raw/accepted/') && !value.includes('..') && !value.includes('\\');
}
