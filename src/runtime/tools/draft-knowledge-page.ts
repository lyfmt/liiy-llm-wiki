import { complete, Type, type Api, type Context, type Model, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import type { KnowledgePageKind } from '../../domain/knowledge-page.js';
import { readRawDocument } from '../../flows/ingest/read-raw-document.js';
import { loadKnowledgePage } from '../../storage/knowledge-page-store.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const pageKind = Type.Union([
  Type.Literal('source'),
  Type.Literal('entity'),
  Type.Literal('topic'),
  Type.Literal('query')
]);

const parameters = Type.Object({
  kind: pageKind,
  slug: Type.String({ description: 'Target page slug without .md' }),
  title: Type.String({ description: 'Draft page title' }),
  aliases: Type.Optional(Type.Array(Type.String())),
  summary: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  source_refs: Type.Array(Type.String({ description: 'Supporting source references for the draft' })),
  outgoing_links: Type.Optional(Type.Array(Type.String())),
  status: Type.String({ description: 'Planned page status' }),
  body: Type.String({ description: 'Proposed markdown body content' }),
  rationale: Type.String({ description: 'Why this draft should exist' })
});

export type DraftKnowledgePageParameters = Static<typeof parameters>;

export interface KnowledgePageDraftSynthesisInput {
  kind: KnowledgePageKind;
  slug: string;
  title: string;
  aliases: string[];
  summary: string;
  tags: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  rationale: string;
  existingPage: ExistingKnowledgePageSnapshot | null;
  linkedPages: LinkedKnowledgePageSnapshot[];
  rawEvidence: RawKnowledgeSourceSnapshot[];
}

export interface KnowledgePageDraftSynthesisResult {
  title?: string;
  summary?: string;
  body: string;
  aliases?: string[];
  tags?: string[];
  outgoing_links?: string[];
  source_refs?: string[];
  status?: string;
  rationale?: string;
  mode?: 'llm' | 'deterministic';
}

export type KnowledgePageDraftSynthesizer = (
  input: KnowledgePageDraftSynthesisInput
) => Promise<KnowledgePageDraftSynthesisResult>;

export interface DraftKnowledgePageToolOptions {
  synthesizeDraft?: KnowledgePageDraftSynthesizer;
}

export interface ExistingKnowledgePageSnapshot {
  path: string;
  title: string;
  summary: string;
  source_refs: string[];
  outgoing_links: string[];
  body: string;
}

export interface LinkedKnowledgePageSnapshot {
  path: string;
  title: string;
  summary: string;
}

export interface RawKnowledgeSourceSnapshot {
  path: string;
  excerpt: string;
}

export interface ModelBackedKnowledgePageDraftSynthesizerInput {
  model: Model<Api>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  sessionId?: string;
}

export function createDraftKnowledgePageTool(
  runtimeContext: RuntimeContext,
  options: DraftKnowledgePageToolOptions = {}
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'draft_knowledge_page',
    label: 'Draft Knowledge Page',
    description:
      'Prepare a source-backed knowledge page draft without mutating the wiki; preferred precursor to apply_draft_upsert for durable non-query pages',
    parameters,
    execute: async (_toolCallId, params) => {
      const pagePath = buildPagePath(params.kind as KnowledgePageKind, params.slug);
      const normalized = normalizeDraftParameters(params);
      const existingPage = await loadExistingPage(runtimeContext.root, normalized.kind, normalized.slug);
      const linkedPages = await loadLinkedPages(runtimeContext.root, normalized.outgoing_links);
      const rawEvidence = await loadRawEvidence(runtimeContext.root, normalized.source_refs);
      let body = normalized.body;
      let synthesisMode: 'llm' | 'deterministic' = 'deterministic';
      let synthesisFallbackReason: string | null = null;
      let synthesizedMetadata: Partial<KnowledgePageDraftSynthesisResult> = {};

      if (options.synthesizeDraft !== undefined) {
        try {
          const synthesis = await options.synthesizeDraft({
            kind: normalized.kind,
            slug: normalized.slug,
            title: normalized.title,
            aliases: normalized.aliases,
            summary: normalized.summary,
            tags: normalized.tags,
            source_refs: normalized.source_refs,
            outgoing_links: normalized.outgoing_links,
            status: normalized.status,
            rationale: normalized.rationale,
            existingPage,
            linkedPages,
            rawEvidence
          });
          const synthesizedBody = synthesis.body.trim();

          if (synthesizedBody.length === 0) {
            synthesisFallbackReason = 'knowledge page synthesizer returned an empty body';
          } else {
            body = synthesizedBody;
            synthesisMode = synthesis.mode ?? 'llm';
            synthesizedMetadata = synthesis;
          }
        } catch (error: unknown) {
          synthesisFallbackReason = error instanceof Error ? error.message : String(error);
        }
      }

      const upsertArguments = {
        kind: normalized.kind,
        slug: normalized.slug,
        title: normalizeSingleLineText(synthesizedMetadata.title) || normalized.title,
        summary: normalizeSingleLineText(synthesizedMetadata.summary) || normalized.summary,
        status: normalizeSingleLineText(synthesizedMetadata.status) || normalized.status,
        updated_at: new Date().toISOString(),
        body,
        rationale: normalizeSingleLineText(synthesizedMetadata.rationale) || normalized.rationale,
        source_refs: normalizeStringArray(synthesizedMetadata.source_refs) ?? normalized.source_refs,
        outgoing_links: normalizeStringArray(synthesizedMetadata.outgoing_links) ?? normalized.outgoing_links,
        aliases: normalizeStringArray(synthesizedMetadata.aliases) ?? normalized.aliases,
        tags: normalizeStringArray(synthesizedMetadata.tags) ?? normalized.tags
      };
      const resultMarkdown = [
        '# Knowledge Page Draft',
        '',
        `- Target: ${pagePath}`,
        `- Kind: ${normalized.kind}`,
        `- Title: ${upsertArguments.title}`,
        `- Summary: ${upsertArguments.summary || '_none_'}`,
        `- Source refs: ${upsertArguments.source_refs.join(', ') || '_none_'}`,
        `- Outgoing links: ${upsertArguments.outgoing_links.join(', ') || '_none_'}`,
        `- Rationale: ${upsertArguments.rationale}`,
        `- Synthesis mode: ${synthesisMode}`,
        `- Synthesis fallback: ${synthesisFallbackReason ?? '_none_'}`,
        '- Preferred next step: apply_draft_upsert',
        '',
        '## Existing Page',
        existingPage ? renderExistingPage(existingPage) : '_none_',
        '',
        '## Linked Page Context',
        linkedPages.length === 0 ? '_none_' : linkedPages.map(renderLinkedPage).join('\n'),
        '',
        '## Raw Evidence',
        rawEvidence.length === 0 ? '_none_' : rawEvidence.map(renderRawEvidence).join('\n'),
        '',
        '## Proposed Body',
        body || '_empty_',
        '',
        '## Upsert Arguments',
        JSON.stringify(upsertArguments, null, 2)
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'draft_knowledge_page',
        summary: `drafted ${pagePath}`,
        evidence: [pagePath, ...upsertArguments.source_refs, ...upsertArguments.outgoing_links],
        touchedFiles: [],
        resultMarkdown,
        data: {
          synthesisMode,
          synthesisFallbackReason,
          draft: {
            targetPath: pagePath,
            upsertArguments
          }
        }
      };

      return {
        content: [{ type: 'text', text: resultMarkdown }],
        details: outcome
      };
    }
  };
}

export function createModelBackedKnowledgePageDraftSynthesizer(
  input: ModelBackedKnowledgePageDraftSynthesizerInput
): KnowledgePageDraftSynthesizer {
  return async (draftInput) => {
    const apiKey = await input.getApiKey?.(input.model.provider);
    const response = await complete(input.model, buildKnowledgeDraftSynthesisContext(draftInput), {
      ...(apiKey ? { apiKey } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {})
    });

    if (response.stopReason === 'error' || response.stopReason === 'aborted') {
      throw new Error(response.errorMessage ?? `Knowledge page synthesis failed with ${response.stopReason}`);
    }

    if (response.content.some((block) => block.type === 'toolCall')) {
      throw new Error('Knowledge page synthesizer returned tool calls instead of JSON');
    }

    const text = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (text.length === 0) {
      throw new Error('Knowledge page synthesizer returned an empty response');
    }

    const parsed = JSON.parse(text) as Partial<KnowledgePageDraftSynthesisResult>;

    if (typeof parsed.body !== 'string') {
      throw new Error('Knowledge page synthesizer response is missing body');
    }

    return {
      ...parsed,
      body: parsed.body,
      mode: 'llm'
    };
  };
}

function buildKnowledgeDraftSynthesisContext(input: KnowledgePageDraftSynthesisInput): Context {
  return {
    systemPrompt: [
      'You are the grounded knowledge-page draft synthesizer for a local-first wiki.',
      'Use only the supplied draft intent, existing page context, linked page context, raw evidence excerpts, and declared source refs/outgoing links.',
      'Return a single JSON object and no surrounding commentary.',
      'Do not invent unsupported source refs or links.',
      'Preserve the requested page kind, slug intent, and durable wiki style.',
      'If context is sparse, still produce a conservative draft body that states the bounded evidence.'
    ].join(' '),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Return JSON with this schema:',
              '{',
              '  "title": string,',
              '  "summary": string,',
              '  "body": string,',
              '  "aliases": string[],',
              '  "tags": string[],',
              '  "outgoing_links": string[],',
              '  "source_refs": string[],',
              '  "status": string,',
              '  "rationale": string',
              '}',
              '',
              `Requested kind: ${input.kind}`,
              `Requested slug: ${input.slug}`,
              `Requested title: ${input.title}`,
              `Requested summary: ${input.summary || '_none_'}`,
              `Requested aliases: ${input.aliases.join(', ') || '_none_'}`,
              `Requested tags: ${input.tags.join(', ') || '_none_'}`,
              `Requested source refs: ${input.source_refs.join(', ') || '_none_'}`,
              `Requested outgoing links: ${input.outgoing_links.join(', ') || '_none_'}`,
              `Requested status: ${input.status}`,
              `Requested rationale: ${input.rationale}`,
              '',
              'Existing page context:',
              input.existingPage ? renderExistingPage(input.existingPage) : '_none_',
              '',
              'Linked page context:',
              input.linkedPages.length === 0 ? '_none_' : input.linkedPages.map(renderLinkedPage).join('\n'),
              '',
              'Raw evidence:',
              input.rawEvidence.length === 0 ? '_none_' : input.rawEvidence.map(renderRawEvidence).join('\n'),
              '',
              'Drafting requirements:',
              '- Write durable markdown suitable for a wiki page.',
              '- Keep claims bounded to the provided context.',
              '- Reuse the provided source refs unless there is a compelling subset.',
              '- Reuse the provided outgoing links unless there is a compelling subset.',
              '- Body should start with a level-1 heading matching the chosen title.'
            ].join('\n')
          }
        ],
        timestamp: Date.now()
      }
    ]
  };
}

function normalizeDraftParameters(params: DraftKnowledgePageParameters): {
  kind: KnowledgePageKind;
  slug: string;
  title: string;
  aliases: string[];
  summary: string;
  tags: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  body: string;
  rationale: string;
} {
  return {
    kind: params.kind as KnowledgePageKind,
    slug: params.slug,
    title: normalizeSingleLineText(params.title) || params.title,
    aliases: normalizeStringArray(params.aliases) ?? [],
    summary: normalizeSingleLineText(params.summary) || '',
    tags: normalizeStringArray(params.tags) ?? [],
    source_refs: normalizeStringArray(params.source_refs) ?? [],
    outgoing_links: normalizeStringArray(params.outgoing_links) ?? [],
    status: normalizeSingleLineText(params.status) || params.status,
    body: params.body.trim(),
    rationale: normalizeSingleLineText(params.rationale) || params.rationale
  };
}

async function loadExistingPage(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<ExistingKnowledgePageSnapshot | null> {
  try {
    const loaded = await loadKnowledgePage(root, kind, slug);
    return {
      path: loaded.page.path,
      title: loaded.page.title,
      summary: loaded.page.summary,
      source_refs: loaded.page.source_refs,
      outgoing_links: loaded.page.outgoing_links,
      body: loaded.body.trim()
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function loadLinkedPages(root: string, outgoingLinks: string[]): Promise<LinkedKnowledgePageSnapshot[]> {
  const snapshots: LinkedKnowledgePageSnapshot[] = [];

  for (const outgoingLink of outgoingLinks) {
    const parsed = parseWikiPagePath(outgoingLink);

    if (!parsed) {
      continue;
    }

    try {
      const loaded = await loadKnowledgePage(root, parsed.kind, parsed.slug);
      snapshots.push({
        path: loaded.page.path,
        title: loaded.page.title,
        summary: loaded.page.summary || summarizeBody(loaded.body)
      });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  return snapshots;
}

async function loadRawEvidence(root: string, sourceRefs: string[]): Promise<RawKnowledgeSourceSnapshot[]> {
  const snapshots: RawKnowledgeSourceSnapshot[] = [];

  for (const sourceRef of sourceRefs) {
    if (!isAcceptedRawPath(sourceRef)) {
      continue;
    }

    try {
      const body = await readRawDocument(root, sourceRef);
      snapshots.push({
        path: sourceRef,
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

  return snapshots;
}

function parseWikiPagePath(pagePath: string): { kind: KnowledgePageKind; slug: string } | null {
  const match = /^wiki\/(sources|entities|topics|queries)\/([^/]+)\.md$/u.exec(pagePath);

  if (!match) {
    return null;
  }

  const directory = match[1]!;
  const slug = match[2]!;
  const kind =
    directory === 'sources'
      ? 'source'
      : directory === 'entities'
        ? 'entity'
        : directory === 'queries'
          ? 'query'
          : 'topic';

  return { kind, slug };
}

function renderExistingPage(existingPage: ExistingKnowledgePageSnapshot): string {
  return [
    `- Path: ${existingPage.path}`,
    `- Title: ${existingPage.title}`,
    `- Summary: ${existingPage.summary || '_none_'}`,
    `- Source refs: ${existingPage.source_refs.join(', ') || '_none_'}`,
    `- Outgoing links: ${existingPage.outgoing_links.join(', ') || '_none_'}`,
    '- Body:',
    existingPage.body || '_empty_'
  ].join('\n');
}

function renderLinkedPage(linkedPage: LinkedKnowledgePageSnapshot): string {
  return `- ${linkedPage.path} | title: ${linkedPage.title} | summary: ${linkedPage.summary || '_none_'}`;
}

function renderRawEvidence(rawEvidence: RawKnowledgeSourceSnapshot): string {
  return `- ${rawEvidence.path}: ${rawEvidence.excerpt}`;
}

function summarizeBody(body: string): string {
  return body
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .join(' ')
    .trim()
    .slice(0, 220);
}

function summarizeRawDocument(body: string): string {
  const summary = summarizeBody(body).slice(0, 220).trim();
  return summary || '_empty_';
}

function normalizeStringArray(values: string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeSingleLineText(value: string | undefined): string {
  return value?.trim().replace(/\s+/gu, ' ') ?? '';
}

function buildPagePath(kind: KnowledgePageKind, slug: string): string {
  const directory = kind === 'source' ? 'sources' : kind === 'entity' ? 'entities' : kind === 'query' ? 'queries' : 'topics';
  return `wiki/${directory}/${slug}.md`;
}

function isAcceptedRawPath(value: string): boolean {
  return value.startsWith('raw/accepted/') && !value.includes('..') && !value.includes('\\');
}
