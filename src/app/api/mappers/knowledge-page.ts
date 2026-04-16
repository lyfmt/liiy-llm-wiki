import type { KnowledgePageResponseDto, KnowledgePageLinkDto } from '../dto/knowledge-page.js';
import type { KnowledgePageKind } from '../../../domain/knowledge-page.js';
import { listKnowledgePages } from '../../../storage/list-knowledge-pages.js';
import { loadKnowledgePage, type LoadedKnowledgePage } from '../../../storage/knowledge-page-store.js';
import { listSourceManifests } from '../../../storage/source-manifest-store.js';

export async function buildKnowledgePageResponseDto(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<KnowledgePageResponseDto> {
  const loaded = await loadKnowledgePage(root, kind, slug);
  const [allPages, manifests] = await Promise.all([loadAllKnowledgePages(root), listSourceManifests(root)]);
  const pageSummaries = new Map(allPages.map((entry) => [entry.page.path, toKnowledgePageLinkDto(entry.page)]));
  const manifestByPath = new Map(manifests.map((manifest) => [manifest.path, manifest]));
  const currentSourceRefs = new Set(loaded.page.source_refs);

  const backlinks = allPages
    .filter((entry) => entry.page.path !== loaded.page.path && entry.page.outgoing_links.includes(loaded.page.path))
    .map((entry) => toKnowledgePageLinkDto(entry.page))
    .sort((left, right) => left.path.localeCompare(right.path));

  const relatedBySource = allPages
    .filter((entry) => entry.page.path !== loaded.page.path)
    .map((entry) => ({
      ...toKnowledgePageLinkDto(entry.page),
      shared_source_refs: entry.page.source_refs.filter((sourceRef) => currentSourceRefs.has(sourceRef))
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

async function loadAllKnowledgePages(root: string): Promise<LoadedKnowledgePage[]> {
  const [sources, entities, topics, queries] = await Promise.all([
    listKnowledgePages(root, 'source'),
    listKnowledgePages(root, 'entity'),
    listKnowledgePages(root, 'topic'),
    listKnowledgePages(root, 'query')
  ]);

  return Promise.all([
    ...sources.map((pageSlug) => loadKnowledgePage(root, 'source', pageSlug)),
    ...entities.map((pageSlug) => loadKnowledgePage(root, 'entity', pageSlug)),
    ...topics.map((pageSlug) => loadKnowledgePage(root, 'topic', pageSlug)),
    ...queries.map((pageSlug) => loadKnowledgePage(root, 'query', pageSlug))
  ]);
}

function toKnowledgePageLinkDto(page: LoadedKnowledgePage['page']): KnowledgePageLinkDto {
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
