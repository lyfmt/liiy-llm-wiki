import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode } from '../../src/domain/graph-node.js';
import { buildGraphProjection } from '../../src/storage/graph-projection-store.js';

describe('buildGraphProjection', () => {
  it('builds a topic projection with section grounding, assertions, and evidence summaries', () => {
    const taxonomy = createGraphNode({
      id: 'taxonomy:software-architecture',
      kind: 'taxonomy',
      title: 'Software Architecture',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const topic = createGraphNode({
      id: 'topic:graph-projection',
      kind: 'topic',
      title: 'Graph Projection',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const section = createGraphNode({
      id: 'section:projection-overview',
      kind: 'section',
      title: 'Projection Overview',
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
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const assertion = createGraphNode({
      id: 'assertion:projection-is-stable',
      kind: 'assertion',
      title: 'Projection is stable for reading',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const evidence = createGraphNode({
      id: 'evidence:projection-spec',
      kind: 'evidence',
      title: 'Projection spec excerpt',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      attributes: {
        locator: 'spec.md#projection',
        excerpt: 'The projection groups evidence under assertions.'
      },
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const source = createGraphNode({
      id: 'source:projection-spec',
      kind: 'source',
      title: 'Projection Spec',
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

    const projection = buildGraphProjection({
      rootId: topic.id,
      nodes: [taxonomy, topic, section, entity, assertion, evidence, source],
      edges: [
        createGraphEdge({
          edge_id: 'edge:belongs-to-taxonomy:1',
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
          edge_id: 'edge:mentions:1',
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
          edge_id: 'edge:part-of:1',
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
          edge_id: 'edge:grounded-by:1',
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
          edge_id: 'edge:about:1',
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
          edge_id: 'edge:supported-by:1',
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
          edge_id: 'edge:derived-from:1',
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
    });

    expect(projection.root.id).toBe(topic.id);
    expect(projection.taxonomy.map((node) => node.id)).toEqual([taxonomy.id]);
    expect(projection.sections).toEqual([
      {
        node: expect.objectContaining({ id: section.id }),
        grounding: {
          source_paths: ['raw/accepted/projection-spec.md'],
          locators: ['spec.md#projection'],
          anchor_count: 1
        }
      }
    ]);
    expect(projection.entities.map((node) => node.id)).toEqual([entity.id]);
    expect(projection.assertions).toHaveLength(1);
    expect(projection.assertions[0]?.node.id).toBe(assertion.id);
    expect(projection.assertions[0]?.evidence).toHaveLength(1);
    expect(projection.assertions[0]?.evidence[0]?.node.id).toBe(evidence.id);
    expect(projection.assertions[0]?.evidence[0]?.source?.id).toBe(source.id);
    expect(projection.evidence).toHaveLength(1);
    expect(projection.evidence[0]?.node.id).toBe(evidence.id);
    expect(projection.evidence[0]?.source?.id).toBe(source.id);
  });

  it('dedupes top-level evidence and uses a stable id-based order', () => {
    const topic = createGraphNode({
      id: 'topic:graph-projection',
      kind: 'topic',
      title: 'Graph Projection',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const assertionA = createGraphNode({
      id: 'assertion:b',
      kind: 'assertion',
      title: 'B assertion',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const assertionB = createGraphNode({
      id: 'assertion:a',
      kind: 'assertion',
      title: 'A assertion',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const evidence = createGraphNode({
      id: 'evidence:shared',
      kind: 'evidence',
      title: 'Shared evidence',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      attributes: {
        locator: 'spec.md#shared',
        excerpt: 'Shared excerpt.'
      },
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });

    const projection = buildGraphProjection({
      rootId: topic.id,
      nodes: [topic, assertionA, assertionB, evidence],
      edges: [
        createGraphEdge({
          edge_id: 'edge:about:z',
          from_id: assertionA.id,
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
          edge_id: 'edge:about:a',
          from_id: assertionB.id,
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
          edge_id: 'edge:supported-by:z',
          from_id: assertionA.id,
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
          edge_id: 'edge:supported-by:a',
          from_id: assertionB.id,
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
        })
      ]
    });

    expect(projection.assertions.map((entry) => entry.node.id)).toEqual(['assertion:a', 'assertion:b']);
    expect(projection.evidence).toHaveLength(1);
    expect(projection.evidence[0]).toMatchObject({
      node: { id: 'evidence:shared' },
      source: null
    });
  });

  it('dedupes section grounding source paths but preserves one locator entry per anchor', () => {
    const topic = createGraphNode({
      id: 'topic:graph-projection',
      kind: 'topic',
      title: 'Graph Projection',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const section = createGraphNode({
      id: 'section:projection-overview',
      kind: 'section',
      title: 'Projection Overview',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const evidenceA = createGraphNode({
      id: 'evidence:projection-a',
      kind: 'evidence',
      title: 'Projection anchor A',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      attributes: {
        locator: 'spec.md#projection',
        excerpt: 'Anchor A.'
      },
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const evidenceB = createGraphNode({
      id: 'evidence:projection-b',
      kind: 'evidence',
      title: 'Projection anchor B',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      attributes: {
        locator: 'spec.md#projection',
        excerpt: 'Anchor B.'
      },
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const source = createGraphNode({
      id: 'source:projection-spec',
      kind: 'source',
      title: 'Projection Spec',
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

    const projection = buildGraphProjection({
      rootId: topic.id,
      nodes: [topic, section, evidenceA, evidenceB, source],
      edges: [
        createGraphEdge({
          edge_id: 'edge:part-of:section',
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
          edge_id: 'edge:grounded-by:a',
          from_id: section.id,
          from_kind: 'section',
          type: 'grounded_by',
          to_id: evidenceA.id,
          to_kind: 'evidence',
          status: 'active',
          confidence: 'asserted',
          provenance: 'source-derived',
          review_state: 'reviewed',
          created_at: '2026-04-20T00:00:00.000Z',
          updated_at: '2026-04-20T00:00:00.000Z'
        }),
        createGraphEdge({
          edge_id: 'edge:grounded-by:b',
          from_id: section.id,
          from_kind: 'section',
          type: 'grounded_by',
          to_id: evidenceB.id,
          to_kind: 'evidence',
          status: 'active',
          confidence: 'asserted',
          provenance: 'source-derived',
          review_state: 'reviewed',
          created_at: '2026-04-20T00:00:00.000Z',
          updated_at: '2026-04-20T00:00:00.000Z'
        }),
        createGraphEdge({
          edge_id: 'edge:derived-from:a',
          from_id: evidenceA.id,
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
        }),
        createGraphEdge({
          edge_id: 'edge:derived-from:b',
          from_id: evidenceB.id,
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
    });

    expect(projection.sections[0]?.grounding).toEqual({
      source_paths: ['raw/accepted/projection-spec.md'],
      locators: ['spec.md#projection', 'spec.md#projection'],
      anchor_count: 2
    });
  });

  it('returns null source when derived_from is missing', () => {
    const topic = createGraphNode({
      id: 'topic:graph-projection',
      kind: 'topic',
      title: 'Graph Projection',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const assertion = createGraphNode({
      id: 'assertion:missing-source',
      kind: 'assertion',
      title: 'Missing source',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const evidence = createGraphNode({
      id: 'evidence:no-source',
      kind: 'evidence',
      title: 'Evidence without source edge',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      attributes: {
        locator: 'spec.md#missing-source',
        excerpt: 'No source edge.'
      },
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });

    const projection = buildGraphProjection({
      rootId: topic.id,
      nodes: [topic, assertion, evidence],
      edges: [
        createGraphEdge({
          edge_id: 'edge:about:missing-source',
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
          edge_id: 'edge:supported-by:missing-source',
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
        })
      ]
    });

    expect(projection.assertions[0]?.evidence[0]?.source).toBeNull();
    expect(projection.evidence[0]?.source).toBeNull();
  });

  it('recursively aggregates rooted taxonomy, sections, mentions, assertions, evidence, and sources', () => {
    const taxonomyParent = createGraphNode({
      id: 'taxonomy:engineering',
      kind: 'taxonomy',
      title: 'Engineering',
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
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });
    const topic = createGraphNode({
      id: 'topic:graph-projection',
      kind: 'topic',
      title: 'Graph Projection',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
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

    const projection = buildGraphProjection({
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
    });

    expect(projection.taxonomy.map((node) => node.id)).toEqual([taxonomyParent.id, taxonomyChild.id]);
    expect(projection.sections).toEqual([
      {
        node: expect.objectContaining({ id: sectionParent.id }),
        grounding: {
          source_paths: [],
          locators: [],
          anchor_count: 0
        }
      },
      {
        node: expect.objectContaining({ id: sectionChild.id }),
        grounding: {
          source_paths: ['raw/accepted/projection-spec.md'],
          locators: ['projection.md#section-grounding'],
          anchor_count: 1
        }
      }
    ]);
    expect(projection.entities.map((node) => node.id)).toEqual([
      entityAssertion.id,
      entityEvidence.id,
      entityTopic.id,
      entitySection.id,
      entitySource.id
    ]);
    expect(projection.assertions.map((entry) => entry.node.id)).toEqual([
      assertionEntity.id,
      assertionSection.id
    ]);
    expect(projection.assertions[0]?.evidence[0]).toMatchObject({
      node: { id: evidenceEntityAssertion.id },
      source: { id: sourceEntity.id }
    });
    expect(projection.assertions[1]?.evidence[0]).toMatchObject({
      node: { id: evidenceSectionAssertion.id },
      source: { id: sourceShared.id }
    });
    expect(projection.evidence).toEqual([
      {
        node: expect.objectContaining({ id: evidenceEntityAssertion.id }),
        source: expect.objectContaining({ id: sourceEntity.id })
      },
      {
        node: expect.objectContaining({ id: evidenceSectionAssertion.id }),
        source: expect.objectContaining({ id: sourceShared.id })
      }
    ]);
  });

  it('throws when the projection root does not exist', () => {
    expect(() =>
      buildGraphProjection({
        rootId: 'topic:missing',
        nodes: [],
        edges: []
      })
    ).toThrow('Graph projection root not found: topic:missing');
  });
});
