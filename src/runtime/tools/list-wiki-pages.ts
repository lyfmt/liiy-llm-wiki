import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import type { KnowledgePageKind } from '../../domain/knowledge-page.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';
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
  kind: Type.Optional(pageKind),
  query: Type.Optional(Type.String({ description: 'Optional navigation query to rank and filter wiki pages' })),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of pages to return', minimum: 1, maximum: 20 }))
});

export type ListWikiPagesParameters = Static<typeof parameters>;

export function createListWikiPagesTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'list_wiki_pages',
    label: 'List Wiki Pages',
    description: 'List wiki pages and their navigation metadata by kind',
    parameters,
    execute: async (_toolCallId, params) => {
      const allKinds = ['source', 'entity', 'topic', 'query'] satisfies KnowledgePageKind[];
      const kinds = params.kind ? [params.kind] : allKinds;
      const normalizedQuery = params.query?.trim().toLowerCase() ?? '';
      const limit = normalizeLimit(params.limit);
      const lines = ['Navigation pages:', '- wiki/index.md', '- wiki/log.md'];
      const evidence: string[] = [];
      let totalReturned = 0;
      const loadedPagesByKind = new Map<KnowledgePageKind, Awaited<ReturnType<typeof loadKnowledgePage>>[]>();

      for (const kind of allKinds) {
        const slugs = await listKnowledgePages(runtimeContext.root, kind);
        loadedPagesByKind.set(kind, await Promise.all(slugs.map(async (slug) => loadKnowledgePage(runtimeContext.root, kind, slug))));
      }

      const incomingLinkCounts = buildIncomingLinkCounts([...loadedPagesByKind.values()].flat());

      for (const kind of kinds) {
        const loadedPages = loadedPagesByKind.get(kind) ?? [];
        const rankedPages = rankPages(loadedPages, normalizedQuery).slice(0, limit);
        lines.push('', `## ${titleizeKind(kind)} (${rankedPages.length}${normalizedQuery ? ` matched / ${loadedPages.length} total` : ''})`);

        if (rankedPages.length === 0) {
          lines.push('- _none_');
          continue;
        }

        for (const entry of rankedPages) {
          const page = entry.loaded.page;
          evidence.push(page.path);
          totalReturned += 1;
          lines.push(
            `- ${page.path} | title: ${page.title} | aliases: ${page.aliases.join(', ') || '_none_'} | summary: ${page.summary || '_none_'} | tags: ${page.tags.join(', ') || '_none_'} | source_refs: ${page.source_refs.length} | outgoing_links: ${page.outgoing_links.length} | incoming_links: ${incomingLinkCounts.get(page.path) ?? 0}${normalizedQuery ? ` | match_score: ${entry.score}` : ''}`
          );
        }
      }

      const resultMarkdown = lines.join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'list_wiki_pages',
        summary: normalizedQuery ? `listed ${totalReturned} wiki page(s) for navigation query "${params.query}"` : `listed ${evidence.length} wiki page(s)`,
        evidence,
        touchedFiles: [],
        resultMarkdown
      };

      return {
        content: [{ type: 'text', text: resultMarkdown }],
        details: outcome
      };
    }
  };
}

function titleizeKind(kind: KnowledgePageKind): string {
  return kind[0]!.toUpperCase() + kind.slice(1);
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return 20;
  }

  return Math.max(1, Math.min(20, Math.trunc(limit)));
}

function rankPages(
  loadedPages: Awaited<ReturnType<typeof loadKnowledgePage>>[],
  normalizedQuery: string
): Array<{ loaded: Awaited<ReturnType<typeof loadKnowledgePage>>; score: number }> {
  if (normalizedQuery === '') {
    return loadedPages.map((loaded) => ({ loaded, score: 0 }));
  }

  const queryTokens = tokenize(normalizedQuery);

  return loadedPages
    .map((loaded) => {
      const page = loaded.page;
      const haystacks = [
        { value: page.title, weight: 5 },
        { value: page.aliases.join(' '), weight: 4 },
        { value: page.summary, weight: 3 },
        { value: page.tags.join(' '), weight: 2 },
        { value: page.outgoing_links.join(' '), weight: 1 },
        { value: loaded.body, weight: 1 }
      ];
      let score = 0;

      for (const token of queryTokens) {
        for (const haystack of haystacks) {
          if (tokenize(haystack.value).includes(token)) {
            score += haystack.weight;
          }
        }
      }

      return { loaded, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.loaded.page.path.localeCompare(right.loaded.page.path));
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function buildIncomingLinkCounts(
  loadedPages: Awaited<ReturnType<typeof loadKnowledgePage>>[]
): Map<string, number> {
  const incomingLinkCounts = new Map<string, number>();

  for (const loaded of loadedPages) {
    for (const outgoingLink of loaded.page.outgoing_links) {
      incomingLinkCounts.set(outgoingLink, (incomingLinkCounts.get(outgoingLink) ?? 0) + 1);
    }
  }

  return incomingLinkCounts;
}
