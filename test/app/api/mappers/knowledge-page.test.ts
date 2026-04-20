import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGraphEdge } from '../../../../src/domain/graph-edge.js';
import { createGraphNode } from '../../../../src/domain/graph-node.js';
import { createKnowledgePage } from '../../../../src/domain/knowledge-page.js';
import { saveKnowledgePage } from '../../../../src/storage/knowledge-page-store.js';

vi.mock('../../../../src/storage/knowledge-page-store.js', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/storage/knowledge-page-store.js')>(
    '../../../../src/storage/knowledge-page-store.js'
  );

  return {
    ...actual,
    loadKnowledgePage: vi.fn(actual.loadKnowledgePage),
    loadKnowledgePageMetadata: vi.fn(actual.loadKnowledgePageMetadata)
  };
});

vi.mock('../../../../src/storage/project-env-store.js', () => ({
  loadProjectEnv: vi.fn(async () => ({
    path: '/tmp/project.env',
    contents: 'GRAPH_DATABASE_URL=postgres://graph.example.invalid/llm_wiki_liiy\n',
    values: { GRAPH_DATABASE_URL: 'postgres://graph.example.invalid/llm_wiki_liiy' },
    keys: ['GRAPH_DATABASE_URL']
  }))
}));

vi.mock('../../../../src/storage/graph-database.js', () => ({
  resolveGraphDatabaseUrl: vi.fn(() => 'postgres://graph.example.invalid/llm_wiki_liiy'),
  createGraphDatabasePool: vi.fn(() => ({
    query: vi.fn()
  }))
}));

vi.mock('../../../../src/storage/load-topic-graph-projection.js', () => ({
  loadTopicGraphProjectionInput: vi.fn(async () => null)
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('buildKnowledgePageResponseDto', () => {
  it('loads the requested page body once and uses metadata reads for related pages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-18T00:00:00.000Z'
        }),
        '# Patch First\n\n'.padEnd(32_768, 'p')
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-18T00:10:00.000Z'
        }),
        '# Patch First Question\n\n'.padEnd(16_384, 'q')
      );

      const storage = await import('../../../../src/storage/knowledge-page-store.js');
      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      const response = await buildKnowledgePageResponseDto(root, 'topic', 'patch-first');

      expect(response.page.title).toBe('Patch First');
      expect(response.page.body.startsWith('# Patch First')).toBe(true);
      expect(response.navigation.related_by_source[0]?.title).toBe('Patch First Question');
      expect(vi.mocked(storage.loadKnowledgePage)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(storage.loadKnowledgePage)).toHaveBeenCalledWith(root, 'topic', 'patch-first');
      expect(vi.mocked(storage.loadKnowledgePageMetadata)).toHaveBeenCalledWith(root, 'query', 'patch-first-question');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns topic graph navigation when a graph projection exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-graph-mapper-'));

    try {
      const markdownBody = '# Patch First\n\nMarkdown body stays authoritative.\n';

      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/queries/patch-first-question.md'],
          status: 'active',
          updated_at: '2026-04-18T00:00:00.000Z'
        }),
        markdownBody
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-18T00:10:00.000Z'
        }),
        '# Patch First Question\n\nPatch first is a reusable answer.\n'
      );

      const graphLoader = await import('../../../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(
        buildTopicGraphProjectionInput('patch-first')
      );

      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      const response = await buildKnowledgePageResponseDto(root, 'topic', 'patch-first');

      expect(response.navigation.taxonomy[0]?.title).toBe('Engineering');
      expect(response.navigation.sections[0]).toMatchObject({
        id: 'section:patch-first-overview',
        title: 'Patch First Overview',
        summary: 'Overview section.',
        grounding: {
          anchor_count: 1,
          source_paths: ['raw/accepted/patch-first-spec.md'],
          locators: ['spec.md#stable']
        }
      });
      expect(response.navigation.entities[0]?.title).toBe('Graph Reader');
      expect(response.page.body).toBe(markdownBody);
      expect(response.navigation.assertions[0]).toMatchObject({
        id: 'assertion:patch-first-stability',
        title: 'Patch First Stability',
        statement: 'Patch-first updates keep the reading path stable.',
        evidence_count: 1
      });
      expect(response.navigation.source_refs.map((entry) => entry.path)).toEqual(['raw/accepted/design.md']);
      expect(response.navigation.outgoing_links).toEqual([
        {
          target: 'wiki/queries/patch-first-question.md',
          is_local_wiki_page: true,
          links: {
            app: '/app/pages/query/patch-first-question',
            api: '/api/pages/query/patch-first-question'
          }
        }
      ]);
      expect(Array.isArray(response.navigation.related_by_source)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not trigger graph loading for non-topic pages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-query-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-18T00:10:00.000Z'
        }),
        '# Patch First Question\n\nPatch first is a reusable answer.\n'
      );

      const graphLoader = await import('../../../../src/storage/load-topic-graph-projection.js');
      const graphDatabase = await import('../../../../src/storage/graph-database.js');
      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      const response = await buildKnowledgePageResponseDto(root, 'query', 'patch-first-question');

      expect(response.page.kind).toBe('query');
      expect(response.navigation.taxonomy).toEqual([]);
      expect(response.navigation.sections).toEqual([]);
      expect(response.navigation.entities).toEqual([]);
      expect(response.navigation.assertions).toEqual([]);
      expect(vi.mocked(graphLoader.loadTopicGraphProjectionInput)).not.toHaveBeenCalled();
      expect(vi.mocked(graphDatabase.createGraphDatabasePool)).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resolves graph-only topic targets as local wiki pages in outgoing links', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-query-graph-link-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/patch-first-spec.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-18T00:10:00.000Z'
        }),
        '# Patch First Question\n\nPatch first is a reusable answer.\n'
      );

      const graphLoader = await import('../../../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockImplementation(async (_client, requestedSlug) =>
        requestedSlug === 'patch-first' ? buildTopicGraphProjectionInput(requestedSlug) : null
      );

      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      const response = await buildKnowledgePageResponseDto(root, 'query', 'patch-first-question');

      expect(response.navigation.outgoing_links).toEqual([
        {
          target: 'wiki/topics/patch-first.md',
          is_local_wiki_page: true,
          links: {
            app: '/app/pages/topic/patch-first',
            api: '/api/pages/topic/patch-first'
          }
        }
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to markdown navigation only when the graph root is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-fallback-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-18T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-18T00:10:00.000Z'
        }),
        '# Patch First Question\n\nPatch first is a reusable answer.\n'
      );

      const graphLoader = await import('../../../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(null);

      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      const response = await buildKnowledgePageResponseDto(root, 'topic', 'patch-first');

      expect(response.navigation.taxonomy).toEqual([]);
      expect(response.navigation.sections).toEqual([]);
      expect(response.navigation.entities).toEqual([]);
      expect(response.navigation.assertions).toEqual([]);
      expect(response.navigation.source_refs[0]?.path).toBe('raw/accepted/design.md');
      expect(response.navigation.related_by_source[0]?.title).toBe('Patch First Question');
      expect(response.navigation.backlinks[0]?.title).toBe('Patch First Question');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a topic response from graph data when markdown is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-synthesized-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/queries/patch-first-question.md',
          kind: 'query',
          title: 'Patch First Question',
          summary: 'Related query summary.',
          source_refs: ['raw/accepted/patch-first-spec.md'],
          outgoing_links: ['wiki/topics/patch-first.md'],
          status: 'active',
          updated_at: '2026-04-18T00:10:00.000Z'
        }),
        '# Patch First Question\n\nPatch first is a reusable answer.\n'
      );

      const graphLoader = await import('../../../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(
        buildTopicGraphProjectionInput('patch-first')
      );

      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      const response = await buildKnowledgePageResponseDto(root, 'topic', 'patch-first');

      expect(response.page).toMatchObject({
        kind: 'topic',
        slug: 'patch-first',
        path: 'wiki/topics/patch-first.md',
        title: 'Patch First',
        summary: 'Patch-first summary.',
        aliases: ['Patching First'],
        tags: [],
        status: 'active',
        updated_at: '2026-04-20T12:00:00.000Z'
      });
      expect(response.page.body).toContain('# Patch First');
      expect(response.navigation.sections[0]).toMatchObject({
        id: 'section:patch-first-overview',
        title: 'Patch First Overview',
        summary: 'Overview section.',
        grounding: {
          anchor_count: 1,
          source_paths: ['raw/accepted/patch-first-spec.md'],
          locators: ['spec.md#stable']
        }
      });
      expect(response.navigation.source_refs[0]?.path).toBe('raw/accepted/patch-first-spec.md');
      expect(response.navigation.outgoing_links).toEqual([
        {
          target: 'wiki/sources/patch-first-spec.md',
          is_local_wiki_page: false,
          links: {
            app: null,
            api: null
          }
        }
      ]);
      expect(response.navigation.related_by_source[0]?.title).toBe('Patch First Question');
      expect(response.navigation.backlinks[0]?.title).toBe('Patch First Question');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reuses a lazily initialized graph database pool across topic requests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-pool-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-18T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const graphLoader = await import('../../../../src/storage/load-topic-graph-projection.js');
      const graphDatabase = await import('../../../../src/storage/graph-database.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(
        buildTopicGraphProjectionInput('patch-first')
      );

      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');
      await buildKnowledgePageResponseDto(root, 'topic', 'patch-first');
      await buildKnowledgePageResponseDto(root, 'topic', 'patch-first');

      expect(vi.mocked(graphDatabase.createGraphDatabasePool)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(graphLoader.loadTopicGraphProjectionInput)).toHaveBeenCalledTimes(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('propagates graph loading errors instead of silently falling back', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-knowledge-page-graph-error-mapper-'));

    try {
      await saveKnowledgePage(
        root,
        createKnowledgePage({
          path: 'wiki/topics/patch-first.md',
          kind: 'topic',
          title: 'Patch First',
          summary: 'Patch-first summary.',
          source_refs: ['raw/accepted/design.md'],
          outgoing_links: [],
          status: 'active',
          updated_at: '2026-04-18T00:00:00.000Z'
        }),
        '# Patch First\n\nPatch-first updates keep page structure stable.\n'
      );

      const graphLoader = await import('../../../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockRejectedValue(new Error('graph unavailable'));

      const { buildKnowledgePageResponseDto } = await import('../../../../src/app/api/mappers/knowledge-page.js');

      await expect(buildKnowledgePageResponseDto(root, 'topic', 'patch-first')).rejects.toThrow('graph unavailable');
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
