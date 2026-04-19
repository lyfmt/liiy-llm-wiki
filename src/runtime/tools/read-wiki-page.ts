import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import type { KnowledgePage, KnowledgePageKind } from '../../domain/knowledge-page.js';
import { listKnowledgePages } from '../../storage/list-knowledge-pages.js';
import { loadKnowledgePage, loadKnowledgePageMetadata } from '../../storage/knowledge-page-store.js';
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
  slug: Type.String({ description: 'Wiki page slug without .md' })
});

export type ReadWikiPageParameters = Static<typeof parameters>;

export function createReadWikiPageTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'read_wiki_page',
    label: 'Read Wiki Page',
    description:
      'Read a specific wiki page in detail, including metadata, backlinks, related pages, and body content. Use after you already have a likely page candidate. Skip it when a direct answer does not need wiki evidence.',
    parameters,
    execute: async (_toolCallId, params) => {
      const loaded = await loadKnowledgePage(runtimeContext.root, params.kind as KnowledgePageKind, params.slug);
      const page = loaded.page;
      const backlinks = await findIncomingLinks(runtimeContext.root, page.path);
      const relatedBySource = await findSharedSourcePages(runtimeContext.root, page);
      const resultMarkdown = [
        `Path: ${page.path}`,
        `Kind: ${page.kind}`,
        `Title: ${page.title}`,
        `Aliases: ${page.aliases.join(', ') || '_none_'}`,
        `Summary: ${page.summary || '_none_'}`,
        `Tags: ${page.tags.join(', ') || '_none_'}`,
        `Source refs: ${page.source_refs.join(', ') || '_none_'}`,
        `Suggested source follow-ups: ${page.source_refs.filter((value) => value.startsWith('raw/accepted/')).map((value) => `read_raw_source:${value}`).join(', ') || '_none_'}`,
        `Outgoing links: ${page.outgoing_links.join(', ') || '_none_'}`,
        `Incoming links: ${backlinks.join(', ') || '_none_'}`,
        `Related pages via shared source refs: ${relatedBySource.join(', ') || '_none_'}`,
        `Status: ${page.status}`,
        `Updated at: ${page.updated_at}`,
        '',
        'Body:',
        loaded.body.trim() || '_empty_'
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'read_wiki_page',
        summary: `read ${page.path}`,
        evidence: [page.path, ...page.source_refs, ...page.outgoing_links, ...backlinks, ...relatedBySource],
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

async function findIncomingLinks(root: string, targetPath: string): Promise<string[]> {
  const pages = await loadAllPages(root);

  return pages.filter((page) => page.outgoing_links.includes(targetPath)).map((page) => page.path).sort();
}

async function findSharedSourcePages(root: string, page: KnowledgePage): Promise<string[]> {
  if (page.source_refs.length === 0) {
    return [];
  }

  const pages = await loadAllPages(root);

  return pages
    .filter((candidate) => candidate.path !== page.path && candidate.source_refs.some((sourceRef) => page.source_refs.includes(sourceRef)))
    .map((candidate) => candidate.path)
    .sort();
}

async function loadAllPages(root: string): Promise<KnowledgePage[]> {
  const kinds: KnowledgePageKind[] = ['source', 'entity', 'topic', 'query'];
  const pages: KnowledgePage[] = [];

  for (const kind of kinds) {
    for (const slug of await listKnowledgePages(root, kind)) {
      pages.push(await loadKnowledgePageMetadata(root, kind, slug));
    }
  }

  return pages;
}
