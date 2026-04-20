import type { KnowledgePageResponseDto, KnowledgePageLinkDto } from '../dto/knowledge-page.js';
import type { KnowledgePage, KnowledgePageKind } from '../../../domain/knowledge-page.js';
import { listKnowledgePages } from '../../../storage/list-knowledge-pages.js';
import { buildGraphProjection } from '../../../storage/graph-projection-store.js';
import { createGraphDatabasePool, resolveGraphDatabaseUrl } from '../../../storage/graph-database.js';
import { loadKnowledgePage, loadKnowledgePageMetadata } from '../../../storage/knowledge-page-store.js';
import { loadProjectEnv } from '../../../storage/project-env-store.js';
import { loadTopicGraphProjectionInput } from '../../../storage/load-topic-graph-projection.js';
import { listSourceManifests } from '../../../storage/source-manifest-store.js';

export async function buildKnowledgePageResponseDto(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<KnowledgePageResponseDto> {
  const loaded = await loadKnowledgePage(root, kind, slug);
  const [allPages, manifests] = await Promise.all([loadAllKnowledgePages(root), listSourceManifests(root)]);
  const graphNavigation = kind === 'topic' ? await loadTopicGraphNavigation(root, slug) : null;
  const pageSummaries = new Map(allPages.map((page) => [page.path, toKnowledgePageLinkDto(page)]));
  const manifestByPath = new Map(manifests.map((manifest) => [manifest.path, manifest]));
  const currentSourceRefs = new Set(loaded.page.source_refs);

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
      outgoing_links: loaded.page.outgoing_links.map((target) => {
        const linkedPage = pageSummaries.get(target) ?? null;
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
      }),
      backlinks,
      related_by_source: relatedBySource
    }
  };
}

async function loadTopicGraphNavigation(
  root: string,
  slug: string
): Promise<KnowledgePageResponseDto['navigation'] | null> {
  try {
    const projectEnv = await loadProjectEnv(root);
    const databaseUrl = resolveGraphDatabaseUrl(projectEnv.contents);
    const client = createGraphDatabasePool(databaseUrl);
    const graphInput = await loadTopicGraphProjectionInput(client, slug);

    if (!graphInput) {
      return null;
    }

    const projection = buildGraphProjection(graphInput);

    return {
      taxonomy: projection.taxonomy.map((node) => ({
        id: node.id,
        title: node.title,
        summary: node.summary
      })),
      sections: projection.sections.map((node) => ({
        id: node.id,
        title: node.title,
        summary: node.summary
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
  } catch {
    return null;
  }
}

async function loadAllKnowledgePages(root: string): Promise<KnowledgePage[]> {
  const [sources, entities, topics, queries] = await Promise.all([
    listKnowledgePages(root, 'source'),
    listKnowledgePages(root, 'entity'),
    listKnowledgePages(root, 'topic'),
    listKnowledgePages(root, 'query')
  ]);

  return Promise.all([
    ...sources.map((pageSlug) => loadKnowledgePageMetadata(root, 'source', pageSlug)),
    ...entities.map((pageSlug) => loadKnowledgePageMetadata(root, 'entity', pageSlug)),
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
