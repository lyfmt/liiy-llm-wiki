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

  it('creates a valid evidence to source derived_from edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:003',
      from_id: 'evidence:gof-p45-para2',
      from_kind: 'evidence',
      type: 'derived_from',
      to_id: 'source:gof-book',
      to_kind: 'source',
      status: 'active',
      confidence: 'asserted',
      provenance: 'source-derived',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('derived_from');
  });

  it('rejects invalid derived_from kinds', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:004',
        from_id: 'assertion:adapter-definition',
        from_kind: 'assertion',
        type: 'derived_from',
        to_id: 'source:gof-book',
        to_kind: 'source',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-synthesized',
        review_state: 'unreviewed',
        qualifiers: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('derived_from edges must connect evidence to source');
  });

  it('creates a valid belongs_to_taxonomy edge that targets taxonomy', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:005',
      from_id: 'topic:design-patterns',
      from_kind: 'topic',
      type: 'belongs_to_taxonomy',
      to_id: 'taxonomy:software-architecture',
      to_kind: 'taxonomy',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('belongs_to_taxonomy');
  });

  it('rejects belongs_to_taxonomy edges that do not target taxonomy', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:006',
        from_id: 'topic:design-patterns',
        from_kind: 'topic',
        type: 'belongs_to_taxonomy',
        to_id: 'topic:architecture',
        to_kind: 'topic',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-synthesized',
        review_state: 'unreviewed',
        qualifiers: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('belongs_to_taxonomy edges must target taxonomy');
  });
});
