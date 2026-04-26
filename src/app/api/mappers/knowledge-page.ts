import type { KnowledgePageResponseDto, KnowledgePageLinkDto } from '../dto/knowledge-page.js';
import type { KnowledgePage, KnowledgePageKind } from '../../../domain/knowledge-page.js';
import { listKnowledgePages } from '../../../storage/list-knowledge-pages.js';
import type { GraphProjection } from '../../../storage/graph-projection-store.js';
import { loadKnowledgePage, loadKnowledgePageMetadata } from '../../../storage/knowledge-page-store.js';
import { loadTopicGraphPage } from '../../../storage/load-topic-graph-page.js';
import { listSourceManifests } from '../../../storage/source-manifest-store.js';

export async function buildKnowledgePageResponseDto(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<KnowledgePageResponseDto> {
  const topicGraphPage = kind === 'topic' ? await loadTopicGraphPage(root, slug) : null;
  const loaded = topicGraphPage ?? (await loadKnowledgePage(root, kind, slug));
  const [allPages, manifests] = await Promise.all([loadAllKnowledgePages(root), listSourceManifests(root)]);
  const graphNavigation = topicGraphPage ? buildTopicGraphNavigation(topicGraphPage.projection) : null;
  const pageSummaries = new Map(allPages.map((page) => [page.path, toKnowledgePageLinkDto(page)]));
  pageSummaries.set(loaded.page.path, toKnowledgePageLinkDto(loaded.page));
  const manifestByPath = new Map(manifests.map((manifest) => [manifest.path, manifest]));
  const currentSourceRefs = new Set(loaded.page.source_refs);
  const resolvedGraphTopicLinks = new Map<string, KnowledgePageLinkDto | null>();

  const backlinks = allPages
    .filter((page) => page.path !== loaded.page.path && page.outgoing_links.includes(loaded.page.path))
    .map((page) => toKnowledgePageLinkDto(page))
    .sort((left, right) => left.path.localeCompare(right.path));

  const relatedBySource = allPages
    .filter((page) => page.path !== loaded.page.path)
    .map((page) => ({
      ...toKnowledgePageLinkDto(page),
      shared_source_refs: page.source_refs.filter((sourceRef) => currentSourceRefs.has(sourceRef))
    }))
    .filter((entry) => entry.shared_source_refs.length > 0)
    .sort((left, right) => right.shared_source_refs.length - left.shared_source_refs.length || left.path.localeCompare(right.path));

  return {
    page: {
      kind: loaded.page.kind,
      slug,
      path: loaded.page.path,
      title: loaded.page.title,
      summary: loaded.page.summary,
      aliases: [...loaded.page.aliases],
      tags: [...loaded.page.tags],
      status: loaded.page.status,
      updated_at: loaded.page.updated_at,
      body: loaded.body
    },
    navigation: {
      taxonomy: graphNavigation?.taxonomy ?? [],
      sections: graphNavigation?.sections ?? [],
      entities: graphNavigation?.entities ?? [],
      assertions: graphNavigation?.assertions ?? [],
      source_refs: loaded.page.source_refs.map((sourceRef) => {
        const manifest = manifestByPath.get(sourceRef) ?? null;
        return {
          path: sourceRef,
          manifest_id: manifest?.id ?? null,
          manifest_title: manifest?.title ?? null,
          links: {
            app: null,
            api: manifest ? `/api/sources/${encodeURIComponent(manifest.id)}` : null
          }
        };
      }),
      outgoing_links: await Promise.all(loaded.page.outgoing_links.map(async (target) => {
        const linkedPage = await resolveLinkedPage(root, target, pageSummaries, resolvedGraphTopicLinks);
        return {
          target,
          is_local_wiki_page: linkedPage !== null,
          links: linkedPage
            ? linkedPage.links
            : {
                app: null,
              api: null
              }
        };
      })),
      backlinks,
      related_by_source: relatedBySource
    }
  };
}

async function resolveLinkedPage(
  root: string,
  target: string,
  pageSummaries: Map<string, KnowledgePageLinkDto>,
  resolvedGraphTopicLinks: Map<string, KnowledgePageLinkDto | null>
): Promise<KnowledgePageLinkDto | null> {
  const existing = pageSummaries.get(target);

  if (existing) {
    return existing;
  }

  const cached = resolvedGraphTopicLinks.get(target);

  if (cached !== undefined) {
    return cached;
  }

  const topicSlug = parseTopicSlugFromPagePath(target);

  if (!topicSlug) {
    resolvedGraphTopicLinks.set(target, null);
    return null;
  }

  try {
    const graphTopicPage = await loadTopicGraphPage(root, topicSlug);
    const linkedPage = graphTopicPage ? toKnowledgePageLinkDto(graphTopicPage.page) : null;

    if (linkedPage) {
      pageSummaries.set(target, linkedPage);
    }

    resolvedGraphTopicLinks.set(target, linkedPage);
    return linkedPage;
  } catch {
    resolvedGraphTopicLinks.set(target, null);
    return null;
  }
}

function parseTopicSlugFromPagePath(target: string): string | null {
  const match = /^wiki\/topics\/([^/]+)\.md$/u.exec(target);
  return match?.[1] ?? null;
}

function buildTopicGraphNavigation(projection: GraphProjection): KnowledgePageResponseDto['navigation'] {
  return {
    taxonomy: projection.taxonomy.map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary
    })),
    sections: projection.sections.map((entry) => ({
      id: entry.node.id,
      title: entry.node.title,
      summary: entry.node.summary,
      grounding: {
        source_paths: [...entry.grounding.source_paths],
        locators: [...entry.grounding.locators],
        anchor_count: entry.grounding.anchor_count
      }
    })),
    entities: projection.entities.map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary
    })),
    assertions: projection.assertions.map((entry) => ({
      id: entry.node.id,
      title: entry.node.title,
      statement: toAssertionStatement(entry.node),
      evidence_count: entry.evidence.length
    })),
    source_refs: [],
    outgoing_links: [],
    backlinks: [],
    related_by_source: []
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

  return Promise.all([
    ...sources.map((pageSlug) => loadKnowledgePageMetadata(root, 'source', pageSlug)),
    ...entities.map((pageSlug) => loadKnowledgePageMetadata(root, 'entity', pageSlug)),
    ...taxonomy.map((pageSlug) => loadKnowledgePageMetadata(root, 'taxonomy', pageSlug)),
    ...topics.map((pageSlug) => loadKnowledgePageMetadata(root, 'topic', pageSlug)),
    ...queries.map((pageSlug) => loadKnowledgePageMetadata(root, 'query', pageSlug))
  ]);
}

function toKnowledgePageLinkDto(page: KnowledgePage): KnowledgePageLinkDto {
  const slug = page.path.split('/').at(-1)?.replace(/\.md$/u, '') ?? page.title;

  return {
    kind: page.kind,
    slug,
    title: page.title,
    summary: page.summary,
    path: page.path,
    links: {
      app: `/app/pages/${page.kind}/${encodeURIComponent(slug)}`,
      api: `/api/pages/${page.kind}/${encodeURIComponent(slug)}`
    }
  };
}

function toAssertionStatement(node: { title: string; summary: string; attributes: Record<string, unknown> }): string {
  const statement = typeof node.attributes.statement === 'string' ? node.attributes.statement.trim() : '';

  if (statement !== '') {
    return statement;
  }

  if (node.summary.trim() !== '') {
    return node.summary.trim();
  }

  return node.title;
}
