import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';

describe('createGraphEdge', () => {
  it('creates a valid assertion to evidence edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:001',
      from_id: 'assertion:adapter-definition',
      from_kind: 'assertion',
      type: 'supported_by',
      to_id: 'evidence:gof-p45-para2',
      to_kind: 'evidence',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('supported_by');
  });

  it('rejects invalid supported_by start kinds', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:002',
        from_id: 'topic:design-patterns',
        from_kind: 'topic',
        type: 'supported_by',
        to_id: 'evidence:gof-p45-para2',
        to_kind: 'evidence',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-synthesized',
        review_state: 'unreviewed',
        qualifiers: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('supported_by edges must connect assertion to evidence');
  });
});
