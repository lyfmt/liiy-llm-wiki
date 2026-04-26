import type {
  KnowledgeGraphRelatedLinkDto,
  KnowledgeNavigationNodeDto,
  KnowledgeNavigationResponseDto
} from '../dto/knowledge-navigation.js';
import type { GraphEdge } from '../../../domain/graph-edge.js';
import type { GraphNode } from '../../../domain/graph-node.js';
import type { KnowledgePage } from '../../../domain/knowledge-page.js';
import { listKnowledgePages } from '../../../storage/list-knowledge-pages.js';
import { loadKnowledgePageMetadata } from '../../../storage/knowledge-page-store.js';
import { loadTopicGraphPage } from '../../../storage/load-topic-graph-page.js';

type TaxonomyPage = KnowledgePage & { kind: 'taxonomy' };
type TopicPage = KnowledgePage & { kind: 'topic' };

export async function buildKnowledgeNavigationResponseDto(root: string): Promise<KnowledgeNavigationResponseDto> {
  const [taxonomyPages, topicPages] = await Promise.all([loadPages(root, 'taxonomy'), loadPages(root, 'topic')]);
  const taxonomyByPath = new Map(taxonomyPages.map((page) => [page.path, page]));
  const childTaxonomyByParentPath = groupByParentTaxonomy(taxonomyPages, taxonomyByPath);
  const topicsByTaxonomyPath = groupTopicsByTaxonomy(topicPages, taxonomyByPath);
  const roots = await Promise.all(
    taxonomyPages
      .filter((page) => findParentTaxonomyPath(page, taxonomyByPath) === null)
      .sort(comparePages)
      .map((page) => buildTaxonomyNode(root, page, childTaxonomyByParentPath, topicsByTaxonomyPath))
  );

  return { roots };
}

async function loadPages(root: string, kind: 'taxonomy'): Promise<TaxonomyPage[]>;
async function loadPages(root: string, kind: 'topic'): Promise<TopicPage[]>;
async function loadPages(root: string, kind: 'taxonomy' | 'topic'): Promise<Array<TaxonomyPage | TopicPage>> {
  const slugs = await listKnowledgePages(root, kind);
  const pages = await Promise.all(slugs.map((slug) => loadKnowledgePageMetadata(root, kind, slug)));

  return pages as Array<TaxonomyPage | TopicPage>;
}

function groupByParentTaxonomy(
  taxonomyPages: TaxonomyPage[],
  taxonomyByPath: Map<string, TaxonomyPage>
): Map<string, TaxonomyPage[]> {
  const grouped = new Map<string, TaxonomyPage[]>();

  for (const page of taxonomyPages) {
    const parentPath = findParentTaxonomyPath(page, taxonomyByPath);

    if (!parentPath) {
      continue;
    }

    const children = grouped.get(parentPath) ?? [];
    children.push(page);
    grouped.set(parentPath, children);
  }

  return grouped;
}

function groupTopicsByTaxonomy(
  topicPages: TopicPage[],
  taxonomyByPath: Map<string, TaxonomyPage>
): Map<string, TopicPage[]> {
  const grouped = new Map<string, TopicPage[]>();

  for (const page of topicPages) {
    const parentPath = findParentTaxonomyPath(page, taxonomyByPath);

    if (!parentPath) {
      continue;
    }

    const topics = grouped.get(parentPath) ?? [];
    topics.push(page);
    grouped.set(parentPath, topics);
  }

  return grouped;
}

function findParentTaxonomyPath(page: KnowledgePage, taxonomyByPath: Map<string, TaxonomyPage>): string | null {
  return page.outgoing_links.find((link) => taxonomyByPath.has(link)) ?? null;
}

async function buildTaxonomyNode(
  root: string,
  page: TaxonomyPage,
  childTaxonomyByParentPath: Map<string, TaxonomyPage[]>,
  topicsByTaxonomyPath: Map<string, TopicPage[]>
): Promise<KnowledgeNavigationNodeDto> {
  const childTaxonomyNodes = await Promise.all(
    (childTaxonomyByParentPath.get(page.path) ?? [])
      .sort(comparePages)
      .map((child) => buildTaxonomyNode(root, child, childTaxonomyByParentPath, topicsByTaxonomyPath))
  );
  const topicNodes = await Promise.all(
    (topicsByTaxonomyPath.get(page.path) ?? []).sort(comparePages).map((topic) => buildTopicNode(root, topic))
  );
  const children = [...childTaxonomyNodes, ...topicNodes];

  return {
    id: page.path,
    kind: 'taxonomy',
    title: page.title,
    summary: page.summary,
    count: children.length,
    href: `/app/pages/taxonomy/${encodeURIComponent(getSlug(page))}`,
    related: [],
    children
  };
}

async function buildTopicNode(root: string, page: TopicPage): Promise<KnowledgeNavigationNodeDto> {
  const children = await buildTopicGraphGroupNodes(root, page);

  return {
    id: page.path,
    kind: 'topic',
    title: page.title,
    summary: page.summary,
    count: 0,
    href: `/app/pages/topic/${encodeURIComponent(getSlug(page))}`,
    related: [],
    children
  };
}

function buildTopicGroupNodes(_root: string, page: TopicPage): KnowledgeNavigationNodeDto[] {
  return [
    emptyGroupNode(`${page.path}#sections`, 'section_group', 'Section'),
    emptyGroupNode(`${page.path}#entities`, 'entity_group', 'Entity'),
    emptyGroupNode(`${page.path}#concepts`, 'concept_group', 'Concept')
  ].map((group) => group);
}

function emptyGroupNode(
  id: string,
  kind: 'section_group' | 'entity_group' | 'concept_group',
  title: string
): KnowledgeNavigationNodeDto {
  return {
    id,
    kind,
    title,
    summary: '',
    count: 0,
    href: null,
    related: [],
    children: []
  };
}

function comparePages(left: KnowledgePage, right: KnowledgePage): number {
  return left.title.localeCompare(right.title) || left.path.localeCompare(right.path);
}

function getSlug(page: KnowledgePage): string {
  return page.path.split('/').at(-1)?.replace(/\.md$/u, '') ?? page.title;
}

async function buildTopicGraphGroupNodes(root: string, page: TopicPage): Promise<KnowledgeNavigationNodeDto[]> {
  const loaded = await loadTopicGraphPageSafely(root, getSlug(page));

  if (!loaded) {
    return buildTopicGroupNodes(root, page);
  }

  const nodesById = new Map<string, GraphNode>([
    [loaded.projection.root.id, loaded.projection.root],
    ...loaded.projection.taxonomy.map((node) => [node.id, node] as const),
    ...loaded.projection.sections.map((entry) => [entry.node.id, entry.node] as const),
    ...loaded.projection.entities.map((node) => [node.id, node] as const),
    ...(loaded.projection.concepts ?? []).map((node) => [node.id, node] as const),
    ...loaded.projection.evidence.map((entry) => [entry.node.id, entry.node] as const)
  ]);
  const edges = loaded.projection.edges ?? [];
  const sectionNodes = loaded.projection.sections.map((entry) => entry.node);
  const entityNodes = loaded.projection.entities;
  const conceptNodes = loaded.projection.concepts ?? [];

  return [
    groupNode(`${page.path}#sections`, 'section_group', 'Section', sectionNodes, page, edges, nodesById),
    groupNode(`${page.path}#entities`, 'entity_group', 'Entity', entityNodes, page, edges, nodesById),
    groupNode(`${page.path}#concepts`, 'concept_group', 'Concept', conceptNodes, page, edges, nodesById)
  ];
}

async function loadTopicGraphPageSafely(root: string, slug: string) {
  try {
    return await loadTopicGraphPage(root, slug);
  } catch {
    return null;
  }
}

function groupNode(
  id: string,
  kind: 'section_group' | 'entity_group' | 'concept_group',
  title: string,
  graphNodes: GraphNode[],
  topicPage: TopicPage,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): KnowledgeNavigationNodeDto {
  const children = graphNodes.sort(compareGraphNodes).map((node) => graphNodeToNavigationNode(node, topicPage, edges, nodesById));

  return {
    id,
    kind,
    title,
    summary: '',
    count: children.length,
    href: null,
    related: [],
    children
  };
}

function graphNodeToNavigationNode(
  node: GraphNode,
  topicPage: TopicPage,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): KnowledgeNavigationNodeDto {
  return {
    id: node.id,
    kind: node.kind as 'section' | 'entity' | 'concept',
    title: node.title,
    summary: node.summary,
    count: 0,
    href: `/app/pages/topic/${encodeURIComponent(getSlug(topicPage))}?node=${encodeURIComponent(node.id)}`,
    related: buildRelatedLinks(node, edges, nodesById, topicPage),
    children: []
  };
}

function buildRelatedLinks(
  node: GraphNode,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>,
  topicPage: TopicPage
): KnowledgeGraphRelatedLinkDto[] {
  return edges
    .filter((edge) => isExposedRelatedEdge(node, edge))
    .sort(compareRelatedEdges)
    .map((edge) => {
      const direction = edge.from_id === node.id ? 'outgoing' : 'incoming';
      const targetId = direction === 'outgoing' ? edge.to_id : edge.from_id;
      const target = nodesById.get(targetId);

      if (!target || !isRelatedTargetKind(target.kind)) {
        return null;
      }

      return {
        edge_id: edge.edge_id,
        type: edge.type as KnowledgeGraphRelatedLinkDto['type'],
        direction,
        target: {
          id: target.id,
          kind: target.kind,
          title: target.title,
          summary: target.summary,
          href: buildRelatedTargetHref(target, topicPage)
        }
      };
    })
    .filter((link): link is KnowledgeGraphRelatedLinkDto => link !== null);
}

function isExposedRelatedEdge(node: GraphNode, edge: GraphEdge): boolean {
  if (!['about', 'grounded_by', 'mentions', 'part_of'].includes(edge.type)) {
    return false;
  }

  return edge.from_id === node.id || edge.to_id === node.id;
}

function isRelatedTargetKind(kind: GraphNode['kind']): kind is KnowledgeGraphRelatedLinkDto['target']['kind'] {
  return ['topic', 'section', 'entity', 'concept', 'evidence'].includes(kind);
}

function buildRelatedTargetHref(target: GraphNode, topicPage: TopicPage): string | null {
  if (target.kind === 'topic') {
    return `/app/pages/topic/${encodeURIComponent(getSlug(topicPage))}`;
  }

  if (target.kind === 'section' || target.kind === 'entity' || target.kind === 'concept') {
    return `/app/pages/topic/${encodeURIComponent(getSlug(topicPage))}?node=${encodeURIComponent(target.id)}`;
  }

  return null;
}

function compareGraphNodes(left: GraphNode, right: GraphNode): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return left.edge_id.localeCompare(right.edge_id);
}

function compareRelatedEdges(left: GraphEdge, right: GraphEdge): number {
  return relatedEdgeRank(left) - relatedEdgeRank(right) || compareEdges(left, right);
}

function relatedEdgeRank(edge: GraphEdge): number {
  if (edge.type === 'part_of') {
    return 0;
  }

  if (edge.type === 'mentions') {
    return edge.to_kind === 'entity' ? 1 : 2;
  }

  if (edge.type === 'grounded_by') {
    return 3;
  }

  return 4;
}
