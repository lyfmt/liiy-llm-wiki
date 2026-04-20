import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode } from '../../src/domain/graph-node.js';
import { buildKnowledgePagePath } from '../../src/storage/knowledge-page-paths.js';

vi.mock('../../src/storage/project-env-store.js', () => ({
  loadProjectEnv: vi.fn(async () => ({
    path: '/tmp/project.env',
    contents: 'GRAPH_DATABASE_URL=postgres://graph.example.invalid/llm_wiki_liiy\n',
    values: { GRAPH_DATABASE_URL: 'postgres://graph.example.invalid/llm_wiki_liiy' },
    keys: ['GRAPH_DATABASE_URL']
  }))
}));

vi.mock('../../src/storage/graph-database.js', () => ({
  resolveGraphDatabaseUrl: vi.fn(() => 'postgres://graph.example.invalid/llm_wiki_liiy'),
  createGraphDatabasePool: vi.fn(() => ({
    query: vi.fn()
  }))
}));

vi.mock('../../src/storage/load-topic-graph-projection.js', () => ({
  loadTopicGraphProjectionInput: vi.fn(async () => null)
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('loadTopicGraphPage', () => {
  it('synthesizes a topic page from graph data when markdown is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-topic-graph-page-'));

    try {
      const graphLoader = await import('../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(
        buildTopicGraphProjectionInput('patch-first')
      );

      const { loadTopicGraphPage } = await import('../../src/storage/load-topic-graph-page.js');
      const loaded = await loadTopicGraphPage(root, 'patch-first');

      expect(loaded).not.toBeNull();
      expect(loaded?.projection.root.id).toBe('topic:patch-first');
      expect(loaded?.page).toMatchObject({
        kind: 'topic',
        path: 'wiki/topics/patch-first.md',
        title: 'Patch First',
        summary: 'Patch-first summary.',
        aliases: ['Patching First'],
        tags: [],
        source_refs: ['raw/accepted/patch-first-spec.md'],
        outgoing_links: ['wiki/sources/patch-first-spec.md'],
        status: 'active',
        updated_at: '2026-04-20T12:00:00.000Z',
      });
      expect(loaded?.body).toContain('# Patch First');
      expect(loaded?.body).toContain('Patch-first summary.');
      expect(loaded?.body).toContain('## Sections');
      expect(loaded?.body).toContain('- Patch First Overview: Overview section.');
      expect(loaded?.body).toContain('Grounding: raw/accepted/patch-first-spec.md');
      expect(loaded?.body).toContain('Locators: spec.md#stable');
      expect(loaded?.body).toContain('Anchors: 1');
      expect(loaded?.body).toContain('## Entities');
      expect(loaded?.body).toContain('- Graph Reader: Topic graph reader.');
      expect(loaded?.body).toContain('## Assertions');
      expect(loaded?.body).toContain('### Patch First Stability');
      expect(loaded?.body).toContain('Patch-first updates keep the reading path stable.');
      expect(loaded?.body).toContain(
        '- Evidence: Patch First spec excerpt. Evidence summary. Source: raw/accepted/patch-first-spec.md.'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns null when the graph root is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-topic-graph-page-missing-'));

    try {
      const graphLoader = await import('../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(null);

      const { loadTopicGraphPage } = await import('../../src/storage/load-topic-graph-page.js');

      await expect(loadTopicGraphPage(root, 'missing')).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rethrows markdown read errors that are not ENOENT instead of synthesizing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-topic-graph-page-invalid-frontmatter-'));

    try {
      const topicPath = buildKnowledgePagePath(root, 'topic', 'patch-first');
      await mkdir(path.dirname(topicPath), { recursive: true });
      await writeFile(
        topicPath,
        [
          '---',
          'kind: topic',
          'title: Patch First',
          'aliases: []',
          'summary: Patch-first summary.',
          'tags: []',
          'source_refs: [raw/accepted/design.md',
          'outgoing_links: []',
          'status: active',
          'updated_at: 2026-04-20T12:00:00.000Z',
          '---',
          '# Patch First',
          ''
        ].join('\n'),
        'utf8'
      );

      const graphLoader = await import('../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(
        buildTopicGraphProjectionInput('patch-first')
      );

      const { loadTopicGraphPage } = await import('../../src/storage/load-topic-graph-page.js');

      await expect(loadTopicGraphPage(root, 'patch-first')).rejects.toThrow(
        'Invalid knowledge page: malformed frontmatter'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function buildTopicGraphProjectionInput(slug: string) {
  const taxonomy = createGraphNode({
    id: 'taxonomy:engineering',
    kind: 'taxonomy',
    title: 'Engineering',
    summary: 'Shared engineering taxonomy.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const topic = createGraphNode({
    id: `topic:${slug}`,
    kind: 'topic',
    title: 'Patch First',
    summary: 'Patch-first summary.',
    aliases: ['Patching First'],
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T12:00:00.000Z'
  });
  const section = createGraphNode({
    id: 'section:patch-first-overview',
    kind: 'section',
    title: 'Patch First Overview',
    summary: 'Overview section.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const entity = createGraphNode({
    id: 'entity:graph-reader',
    kind: 'entity',
    title: 'Graph Reader',
    summary: 'Topic graph reader.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const assertion = createGraphNode({
    id: 'assertion:patch-first-stability',
    kind: 'assertion',
    title: 'Patch First Stability',
    summary: 'Patch-first updates keep the reading path stable.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      statement: 'Patch-first updates keep the reading path stable.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const evidence = createGraphNode({
    id: 'evidence:patch-first-spec',
    kind: 'evidence',
    title: 'Patch First spec excerpt',
    summary: 'Evidence summary.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    attributes: {
      locator: 'spec.md#stable',
      excerpt: 'Patch-first updates keep page structure stable.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const source = createGraphNode({
    id: 'source:patch-first-spec',
    kind: 'source',
    title: 'Patch First Spec',
    summary: 'Original spec.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      path: 'raw/accepted/patch-first-spec.md'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });

  return {
    rootId: topic.id,
    nodes: [taxonomy, topic, section, entity, assertion, evidence, source],
    edges: [
      createGraphEdge({
        edge_id: 'edge:belongs-to-taxonomy:patch-first',
        from_id: topic.id,
        from_kind: 'topic',
        type: 'belongs_to_taxonomy',
        to_id: taxonomy.id,
        to_kind: 'taxonomy',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:part-of:patch-first',
        from_id: section.id,
        from_kind: 'section',
        type: 'part_of',
        to_id: topic.id,
        to_kind: 'topic',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:grounded-by:patch-first',
        from_id: section.id,
        from_kind: 'section',
        type: 'grounded_by',
        to_id: evidence.id,
        to_kind: 'evidence',
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:mentions:patch-first',
        from_id: topic.id,
        from_kind: 'topic',
        type: 'mentions',
        to_id: entity.id,
        to_kind: 'entity',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:about:patch-first',
        from_id: assertion.id,
        from_kind: 'assertion',
        type: 'about',
        to_id: topic.id,
        to_kind: 'topic',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:supported-by:patch-first',
        from_id: assertion.id,
        from_kind: 'assertion',
        type: 'supported_by',
        to_id: evidence.id,
        to_kind: 'evidence',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:derived-from:patch-first',
        from_id: evidence.id,
        from_kind: 'evidence',
        type: 'derived_from',
        to_id: source.id,
        to_kind: 'source',
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      })
    ]
  };
}
