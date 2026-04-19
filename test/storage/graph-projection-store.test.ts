import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode } from '../../src/domain/graph-node.js';
import { buildGraphProjection } from '../../src/storage/graph-projection-store.js';

type AboutEdge = {
  edge_id: string;
  from_id: string;
  from_kind: 'assertion';
  type: 'about';
  to_id: string;
  to_kind: 'topic';
  status: 'draft' | 'active' | 'stale' | 'disputed' | 'archived';
  confidence: 'asserted' | 'inferred' | 'weak' | 'conflicted';
  provenance: 'source-derived' | 'agent-extracted' | 'agent-synthesized' | 'human-edited';
  review_state: 'unreviewed' | 'reviewed' | 'rejected';
  qualifiers: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

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

    const aboutEdge: AboutEdge = {
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
      qualifiers: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z'
    };

    const projection = buildGraphProjection({
      rootId: topic.id,
      nodes: [topic, assertion, evidence, source],
      edges: [
        aboutEdge,
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
});
