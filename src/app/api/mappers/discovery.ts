import { readFile } from 'node:fs/promises';

import type { DiscoveryItemDto, DiscoveryResponseDto, DiscoverySectionDto } from '../dto/discovery.js';
import type { KnowledgePage } from '../../../domain/knowledge-page.js';
import { listKnowledgePages } from '../../../storage/list-knowledge-pages.js';
import { loadKnowledgePageMetadata } from '../../../storage/knowledge-page-store.js';
import { buildProjectPaths } from '../../../config/project-paths.js';

export async function buildDiscoveryResponseDto(root: string): Promise<DiscoveryResponseDto> {
  const paths = buildProjectPaths(root);
  const [indexMarkdown, pages] = await Promise.all([readOptionalText(paths.wikiIndex), loadAllKnowledgePages(root)]);
  const sections = buildDiscoverySections(pages);

  return {
    index_markdown: indexMarkdown,
    totals: {
      sources: sections.find((section) => section.kind === 'source')?.count ?? 0,
      entities: sections.find((section) => section.kind === 'entity')?.count ?? 0,
      taxonomy: sections.find((section) => section.kind === 'taxonomy')?.count ?? 0,
      topics: sections.find((section) => section.kind === 'topic')?.count ?? 0,
      queries: sections.find((section) => section.kind === 'query')?.count ?? 0
    },
    sections
  };
}

async function loadAllKnowledgePages(root: string): Promise<KnowledgePage[]> {
  const [sources, entities, taxonomy, topics, queries] = await Promise.all([
    listKnowledgePages(root, 'source'),
    listKnowledgePages(root, 'entity'),
    listKnowledgePages(root, 'taxonomy'),
    listKnowledgePages(root, 'topic'),
    listKnowledgePages(root, 'query')
  ]);

  const loaded = await Promise.all([
    ...sources.map((slug) => loadKnowledgePageMetadata(root, 'source', slug)),
    ...entities.map((slug) => loadKnowledgePageMetadata(root, 'entity', slug)),
    ...taxonomy.map((slug) => loadKnowledgePageMetadata(root, 'taxonomy', slug)),
    ...topics.map((slug) => loadKnowledgePageMetadata(root, 'topic', slug)),
    ...queries.map((slug) => loadKnowledgePageMetadata(root, 'query', slug))
  ]);

  return loaded;
}

function buildDiscoverySections(pages: KnowledgePage[]): DiscoverySectionDto[] {
  return ([
    ['taxonomy', 'Taxonomy', 'Browse durable taxonomy pages that define the wiki navigation tree.'],
    ['topic', 'Topics', 'Start from durable topics that summarize concepts and connect evidence.'],
    ['entity', 'Entities', 'Inspect named entities, references, and explicit links across the wiki.'],
    ['query', 'Queries', 'Reuse durable answers when a request has already been grounded and captured.'],
    ['source', 'Sources', 'Trace claims back to accepted manifests and raw evidence.']
  ] as const).map(([kind, title, description]) => {
    const items = pages
      .filter((page) => page.kind === kind)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || left.path.localeCompare(right.path))
      .map((page) => toDiscoveryItemDto(page));

    return {
      kind,
      title,
      description,
      count: items.length,
      items
    };
  });
}

function toDiscoveryItemDto(page: KnowledgePage): DiscoveryItemDto {
  const slug = getPageSlug(page.path);

  return {
    kind: page.kind,
    slug,
    title: page.title,
    summary: page.summary,
    tags: [...page.tags],
    updated_at: page.updated_at,
    path: page.path,
    source_ref_count: page.source_refs.length,
    links: {
      app: `/app/pages/${page.kind}/${encodeURIComponent(slug)}`,
      api: `/api/pages/${page.kind}/${encodeURIComponent(slug)}`
    }
  };
}

function getPageSlug(path: string): string {
  return path.split('/').at(-1)?.replace(/\.md$/u, '') ?? path;
}

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}
