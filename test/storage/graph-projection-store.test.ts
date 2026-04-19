import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode } from '../../src/domain/graph-node.js';
import { buildGraphProjection } from '../../src/storage/graph-projection-store.js';

describe('buildGraphProjection', () => {
  it('builds a topic projection with assertions and evidence summaries', () => {
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
      attributes: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    });

    const projection = buildGraphProjection({
      rootId: topic.id,
      nodes: [topic, assertion, evidence, source],
      edges: [
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
