import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGraphEdge } from '../../../../src/domain/graph-edge.js';
import { createGraphNode, type GraphNode } from '../../../../src/domain/graph-node.js';
import { createKnowledgePage } from '../../../../src/domain/knowledge-page.js';
import { saveKnowledgePage } from '../../../../src/storage/knowledge-page-store.js';

vi.mock('../../../../src/storage/project-env-store.js', () => ({
  loadProjectEnv: vi.fn(async () => ({
    path: '/tmp/project.env',
    contents: 'GRAPH_DATABASE_URL=postgres://graph.example.invalid/llm_wiki_liiy\n',
    values: { GRAPH_DATABASE_URL: 'postgres://graph.example.invalid/llm_wiki_liiy' },
    keys: ['GRAPH_DATABASE_URL']
  }))
}));

vi.mock('../../../../src/storage/graph-database.js', () => {
  const sharedClient = {
    query: vi.fn()
  };

  return {
    resolveGraphDatabaseUrl: vi.fn(() => 'postgres://graph.example.invalid/llm_wiki_liiy'),
    getSharedGraphDatabasePool: vi.fn(() => sharedClient)
  };
});

vi.mock('../../../../src/storage/load-topic-graph-projection.js', () => ({
  loadTopicGraphProjectionInput: vi.fn(async (_client, slug: string) =>
    slug === 'll1' ? buildTopicGraphProjectionInput(slug) : null
  )
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('buildKnowledgeNavigationResponseDto', () => {
  it('builds a taxonomy-first drill-down tree with topic graph groups and excludes raw/source pages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-navigation-'));

    try {
      await savePage(root, 'taxonomy', 'programming', '编程', 'Programming knowledge.', []);
      await savePage(root, 'taxonomy', 'compiler-principles', '编译原理', 'Compiler theory.', [
        'wiki/taxonomy/programming.md'
      ]);
      await savePage(root, 'topic', 'll1', 'LL(1)', 'Predictive parsing.', [
        'wiki/taxonomy/compiler-principles.md'
      ]);
      await savePage(root, 'source', 'raw-manifest', 'Raw Manifest', 'Raw material should stay out.', []);
      await savePage(root, 'query', 'old-answer', 'Old Answer', 'Query pages should stay out.', []);

      const { buildKnowledgeNavigationResponseDto } = await import(
        '../../../../src/app/api/mappers/knowledge-navigation.js'
      );
      const response = await buildKnowledgeNavigationResponseDto(root);

      expect(response.roots.map((node) => node.title)).toEqual(['编程']);
      expect(flattenTitles(response.roots)).not.toContain('Raw Manifest');
      expect(flattenTitles(response.roots)).not.toContain('Old Answer');

      const programming = response.roots[0]!;
      expect(programming.kind).toBe('taxonomy');
      expect(programming.count).toBe(1);
      expect(programming.children.map((node) => node.title)).toEqual(['编译原理']);

      const compilerPrinciples = programming.children[0]!;
      expect(compilerPrinciples.kind).toBe('taxonomy');
      expect(compilerPrinciples.count).toBe(1);
      expect(compilerPrinciples.children.map((node) => [node.kind, node.title])).toEqual([['topic', 'LL(1)']]);

      const topic = compilerPrinciples.children[0]!;
      expect(topic.href).toBe('/app/pages/topic/ll1');
      expect(topic.children.map((node) => [node.kind, node.title, node.count])).toEqual([
        ['section_group', 'Section', 1],
        ['entity_group', 'Entity', 1],
        ['concept_group', 'Concept', 1]
      ]);

      const sectionGroup = topic.children.find((node) => node.kind === 'section_group')!;
      expect(sectionGroup.children.map((node) => [node.kind, node.title])).toEqual([
        ['section', 'FIRST 集合']
      ]);
      expect(sectionGroup.children[0]?.related.map((link) => [link.type, link.target.kind, link.target.title])).toEqual([
        ['part_of', 'topic', 'LL(1)'],
        ['mentions', 'entity', 'Parser'],
        ['mentions', 'concept', 'Lookahead'],
        ['grounded_by', 'evidence', 'Dragon Book excerpt']
      ]);

      const entityGroup = topic.children.find((node) => node.kind === 'entity_group')!;
      expect(entityGroup.children.map((node) => node.title)).toEqual(['Parser']);

      const conceptGroup = topic.children.find((node) => node.kind === 'concept_group')!;
      expect(conceptGroup.children.map((node) => node.title)).toEqual(['Lookahead']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function savePage(
  root: string,
  kind: 'taxonomy' | 'topic' | 'source' | 'query',
  slug: string,
  title: string,
  summary: string,
  outgoingLinks: string[]
) {
  await saveKnowledgePage(
    root,
    createKnowledgePage({
      path: `wiki/${kind === 'taxonomy' ? 'taxonomy' : kind === 'topic' ? 'topics' : kind === 'source' ? 'sources' : 'queries'}/${slug}.md`,
      kind,
      title,
      summary,
      source_refs: [],
      outgoing_links: outgoingLinks,
      status: 'active',
      updated_at: '2026-04-26T00:00:00.000Z'
    }),
    `# ${title}\n\n${summary}\n`
  );
}

interface TitledTree {
  title: string;
  children: TitledTree[];
}

function flattenTitles(nodes: TitledTree[]): string[] {
  return nodes.flatMap((node) => [node.title, ...flattenTitles(node.children)]);
}

function buildTopicGraphProjectionInput(slug: string) {
  const topic = graphNode(`topic:${slug}`, 'topic', 'LL(1)', 'Predictive parsing.');
  const section = graphNode('section:first-set', 'section', 'FIRST 集合', 'FIRST set section.');
  const entity = graphNode('entity:parser', 'entity', 'Parser', 'Parser entity.');
  const concept = graphNode('concept:lookahead', 'concept', 'Lookahead', 'Lookahead concept.');
  const evidence = graphNode('evidence:dragon-book', 'evidence', 'Dragon Book excerpt', 'Evidence summary.', {
    locator: 'p12',
    excerpt: 'FIRST sets support predictive parsing.'
  });
  const source = graphNode('source:dragon-book', 'source', 'Dragon Book', 'Compiler text.', {
    path: 'raw/accepted/dragon-book.md'
  });

  return {
    rootId: topic.id,
    nodes: [topic, section, entity, concept, evidence, source],
    edges: [
      graphEdge('edge:section-topic', section, 'part_of', topic),
      graphEdge('edge:section-entity', section, 'mentions', entity),
      graphEdge('edge:section-concept', section, 'mentions', concept),
      graphEdge('edge:topic-entity', topic, 'mentions', entity),
      graphEdge('edge:topic-concept', topic, 'mentions', concept),
      graphEdge('edge:section-evidence', section, 'grounded_by', evidence),
      graphEdge('edge:evidence-source', evidence, 'derived_from', source)
    ]
  };
}

function graphNode(
  id: string,
  kind: GraphNode['kind'],
  title: string,
  summary: string,
  attributes: Record<string, unknown> = {}
): GraphNode {
  return createGraphNode({
    id,
    kind,
    title,
    summary,
    status: 'active',
    confidence: 'asserted',
    provenance: kind === 'evidence' ? 'source-derived' : 'human-edited',
    review_state: 'reviewed',
    attributes,
    created_at: '2026-04-26T00:00:00.000Z',
    updated_at: '2026-04-26T00:00:00.000Z'
  });
}

function graphEdge(edgeId: string, from: GraphNode, type: 'part_of' | 'mentions' | 'grounded_by' | 'derived_from', to: GraphNode) {
  return createGraphEdge({
    edge_id: edgeId,
    from_id: from.id,
    from_kind: from.kind,
    type,
    to_id: to.id,
    to_kind: to.kind,
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    created_at: '2026-04-26T00:00:00.000Z',
    updated_at: '2026-04-26T00:00:00.000Z'
  });
}
