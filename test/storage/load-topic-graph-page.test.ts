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
  getSharedGraphDatabasePool: vi.fn(() => ({
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

  it('synthesizes rooted taxonomy, nested sections, and rooted source refs from the graph projection', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-topic-graph-page-rooted-'));

    try {
      const graphLoader = await import('../../src/storage/load-topic-graph-projection.js');
      vi.mocked(graphLoader.loadTopicGraphProjectionInput).mockResolvedValue(
        buildRootedTopicGraphProjectionInput('graph-projection')
      );

      const { loadTopicGraphPage } = await import('../../src/storage/load-topic-graph-page.js');
      const loaded = await loadTopicGraphPage(root, 'graph-projection');

      expect(loaded).not.toBeNull();
      expect(loaded?.projection.taxonomy.map((node) => node.id)).toEqual([
        'taxonomy:engineering',
        'taxonomy:platform'
      ]);
      expect(loaded?.projection.sections.map((entry) => entry.node.id)).toEqual([
        'section:projection-overview',
        'section:projection-overview-details'
      ]);
      expect(loaded?.projection.entities.map((node) => node.id)).toEqual([
        'entity:assertion-reader',
        'entity:evidence-anchor',
        'entity:graph-reader',
        'entity:section-reader',
        'entity:source-index'
      ]);
      expect(loaded?.projection.assertions.map((entry) => entry.node.id)).toEqual([
        'assertion:entity-claim',
        'assertion:section-claim'
      ]);
      expect(loaded?.page.source_refs).toEqual([
        'raw/accepted/entity-spec.md',
        'raw/accepted/projection-spec.md'
      ]);
      expect(loaded?.page.outgoing_links).toEqual([
        'wiki/sources/entity-spec.md',
        'wiki/sources/projection-spec.md'
      ]);
      expect(loaded?.body).toContain('- Projection Overview: Top-level section.');
      expect(loaded?.body).toContain('- Projection Details: Nested section.');
      expect(loaded?.body).toContain('- Assertion Reader');
      expect(loaded?.body).toContain('- Source Index');
      expect(loaded?.body).toContain('### Entity claim');
      expect(loaded?.body).toContain('### Section claim');
      expect(loaded?.body).toContain('Source: raw/accepted/entity-spec.md.');
      expect(loaded?.body).toContain('Source: raw/accepted/projection-spec.md.');
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

function buildRootedTopicGraphProjectionInput(slug: string) {
  const taxonomyParent = createGraphNode({
    id: 'taxonomy:engineering',
    kind: 'taxonomy',
    title: 'Engineering',
    summary: 'Top-level taxonomy.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const taxonomyChild = createGraphNode({
    id: 'taxonomy:platform',
    kind: 'taxonomy',
    title: 'Platform',
    summary: 'Child taxonomy.',
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
    title: 'Graph Projection',
    summary: 'Projection summary.',
    aliases: ['Projection Root'],
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T12:00:00.000Z'
  });
  const sectionParent = createGraphNode({
    id: 'section:projection-overview',
    kind: 'section',
    title: 'Projection Overview',
    summary: 'Top-level section.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const sectionChild = createGraphNode({
    id: 'section:projection-overview-details',
    kind: 'section',
    title: 'Projection Details',
    summary: 'Nested section.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const entityTopic = createGraphNode({
    id: 'entity:graph-reader',
    kind: 'entity',
    title: 'Graph Reader',
    summary: 'Topic mention.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const entitySection = createGraphNode({
    id: 'entity:section-reader',
    kind: 'entity',
    title: 'Section Reader',
    summary: 'Section mention.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const entityEvidence = createGraphNode({
    id: 'entity:evidence-anchor',
    kind: 'entity',
    title: 'Evidence Anchor',
    summary: 'Evidence mention.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const entitySource = createGraphNode({
    id: 'entity:source-index',
    kind: 'entity',
    title: 'Source Index',
    summary: 'Source mention.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const entityAssertion = createGraphNode({
    id: 'entity:assertion-reader',
    kind: 'entity',
    title: 'Assertion Reader',
    summary: 'Assertion mention.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const assertionSection = createGraphNode({
    id: 'assertion:section-claim',
    kind: 'assertion',
    title: 'Section claim',
    summary: 'Section rooted assertion.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      statement: 'Section rooted assertion.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const assertionEntity = createGraphNode({
    id: 'assertion:entity-claim',
    kind: 'assertion',
    title: 'Entity claim',
    summary: 'Entity rooted assertion.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      statement: 'Entity rooted assertion.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const evidenceGrounding = createGraphNode({
    id: 'evidence:section-grounding',
    kind: 'evidence',
    title: 'Section grounding',
    summary: 'Grounding evidence.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    attributes: {
      locator: 'projection.md#section-grounding',
      excerpt: 'Section grounding anchor.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const evidenceSectionAssertion = createGraphNode({
    id: 'evidence:section-claim-proof',
    kind: 'evidence',
    title: 'Section claim proof',
    summary: 'Section evidence.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    attributes: {
      locator: 'projection.md#section-claim',
      excerpt: 'Section assertion anchor.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const evidenceEntityAssertion = createGraphNode({
    id: 'evidence:entity-claim-proof',
    kind: 'evidence',
    title: 'Entity claim proof',
    summary: 'Entity evidence.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    attributes: {
      locator: 'projection.md#entity-claim',
      excerpt: 'Entity assertion anchor.'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const sourceShared = createGraphNode({
    id: 'source:projection-spec',
    kind: 'source',
    title: 'Projection Spec',
    summary: 'Projection source.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      path: 'raw/accepted/projection-spec.md'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
  const sourceEntity = createGraphNode({
    id: 'source:entity-spec',
    kind: 'source',
    title: 'Entity Spec',
    summary: 'Entity source.',
    status: 'active',
    confidence: 'asserted',
    provenance: 'human-edited',
    review_state: 'reviewed',
    attributes: {
      path: 'raw/accepted/entity-spec.md'
    },
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });

  return {
    rootId: topic.id,
    nodes: [
      taxonomyParent,
      taxonomyChild,
      topic,
      sectionParent,
      sectionChild,
      entityTopic,
      entitySection,
      entityEvidence,
      entitySource,
      entityAssertion,
      assertionSection,
      assertionEntity,
      evidenceGrounding,
      evidenceSectionAssertion,
      evidenceEntityAssertion,
      sourceShared,
      sourceEntity
    ],
    edges: [
      createGraphEdge({
        edge_id: 'edge:belongs-to-taxonomy:topic-platform',
        from_id: topic.id,
        from_kind: 'topic',
        type: 'belongs_to_taxonomy',
        to_id: taxonomyChild.id,
        to_kind: 'taxonomy',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:part-of:taxonomy-platform-engineering',
        from_id: taxonomyChild.id,
        from_kind: 'taxonomy',
        type: 'part_of',
        to_id: taxonomyParent.id,
        to_kind: 'taxonomy',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:part-of:section-parent-topic',
        from_id: sectionParent.id,
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
        edge_id: 'edge:part-of:section-child-parent',
        from_id: sectionChild.id,
        from_kind: 'section',
        type: 'part_of',
        to_id: sectionParent.id,
        to_kind: 'section',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:mentions:topic-entity',
        from_id: topic.id,
        from_kind: 'topic',
        type: 'mentions',
        to_id: entityTopic.id,
        to_kind: 'entity',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:mentions:section-entity',
        from_id: sectionChild.id,
        from_kind: 'section',
        type: 'mentions',
        to_id: entitySection.id,
        to_kind: 'entity',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:grounded-by:section-evidence',
        from_id: sectionChild.id,
        from_kind: 'section',
        type: 'grounded_by',
        to_id: evidenceGrounding.id,
        to_kind: 'evidence',
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:derived-from:evidence-shared-source',
        from_id: evidenceGrounding.id,
        from_kind: 'evidence',
        type: 'derived_from',
        to_id: sourceShared.id,
        to_kind: 'source',
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:mentions:evidence-entity',
        from_id: evidenceGrounding.id,
        from_kind: 'evidence',
        type: 'mentions',
        to_id: entityEvidence.id,
        to_kind: 'entity',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:mentions:source-entity',
        from_id: sourceShared.id,
        from_kind: 'source',
        type: 'mentions',
        to_id: entitySource.id,
        to_kind: 'entity',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:about:assertion-section',
        from_id: assertionSection.id,
        from_kind: 'assertion',
        type: 'about',
        to_id: sectionChild.id,
        to_kind: 'section',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:supported-by:assertion-section',
        from_id: assertionSection.id,
        from_kind: 'assertion',
        type: 'supported_by',
        to_id: evidenceSectionAssertion.id,
        to_kind: 'evidence',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:mentions:assertion-entity',
        from_id: assertionSection.id,
        from_kind: 'assertion',
        type: 'mentions',
        to_id: entityAssertion.id,
        to_kind: 'entity',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:derived-from:assertion-section-source',
        from_id: evidenceSectionAssertion.id,
        from_kind: 'evidence',
        type: 'derived_from',
        to_id: sourceShared.id,
        to_kind: 'source',
        status: 'active',
        confidence: 'asserted',
        provenance: 'source-derived',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:about:assertion-entity',
        from_id: assertionEntity.id,
        from_kind: 'assertion',
        type: 'about',
        to_id: entitySource.id,
        to_kind: 'entity',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:supported-by:assertion-entity',
        from_id: assertionEntity.id,
        from_kind: 'assertion',
        type: 'supported_by',
        to_id: evidenceEntityAssertion.id,
        to_kind: 'evidence',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z'
      }),
      createGraphEdge({
        edge_id: 'edge:derived-from:assertion-entity-source',
        from_id: evidenceEntityAssertion.id,
        from_kind: 'evidence',
        type: 'derived_from',
        to_id: sourceEntity.id,
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
