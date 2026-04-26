import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';

describe('createGraphEdge', () => {
  it('creates a valid taxonomy to taxonomy part_of edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:part-of:taxonomy',
      from_id: 'taxonomy:software',
      from_kind: 'taxonomy',
      type: 'part_of',
      to_id: 'taxonomy:technology',
      to_kind: 'taxonomy',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('part_of');
  });

  it('creates a valid section to topic part_of edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:part-of:section',
      from_id: 'section:adapter-pattern',
      from_kind: 'section',
      type: 'part_of',
      to_id: 'topic:design-patterns',
      to_kind: 'topic',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('part_of');
  });

  it('rejects invalid part_of edge kinds', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:part-of:invalid',
        from_id: 'topic:design-patterns',
        from_kind: 'topic',
        type: 'part_of',
        to_id: 'topic:software',
        to_kind: 'topic',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-synthesized',
        review_state: 'unreviewed',
        qualifiers: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('part_of edges must connect taxonomy to taxonomy or section to topic/section');
  });

  it('creates a valid assertion to topic about edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:000',
      from_id: 'assertion:adapter-definition',
      from_kind: 'assertion',
      type: 'about',
      to_id: 'topic:design-patterns',
      to_kind: 'topic',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('about');
  });

  it('rejects invalid about edge kinds', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:000b',
        from_id: 'topic:design-patterns',
        from_kind: 'topic',
        type: 'about',
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
    ).toThrow('about edges must connect assertion to topic, section, entity, or concept');
  });

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

  it('creates a valid section to evidence grounded_by edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:grounded-by:valid',
      from_id: 'section:adapter-pattern',
      from_kind: 'section',
      type: 'grounded_by',
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

    expect(edge.type).toBe('grounded_by');
  });

  it('rejects invalid grounded_by edge kinds', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:grounded-by:invalid',
        from_id: 'topic:design-patterns',
        from_kind: 'topic',
        type: 'grounded_by',
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
    ).toThrow('grounded_by edges must connect section to evidence');
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

  it('creates a valid topic to entity mentions edge', () => {
    const edge = createGraphEdge({
      edge_id: 'edge:mentions:valid',
      from_id: 'topic:design-patterns',
      from_kind: 'topic',
      type: 'mentions',
      to_id: 'entity:gang-of-four',
      to_kind: 'entity',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      qualifiers: {},
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(edge.type).toBe('mentions');
  });

  it('rejects invalid mentions edge kinds', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:mentions:invalid',
        from_id: 'topic:design-patterns',
        from_kind: 'topic',
        type: 'mentions',
        to_id: 'topic:software-architecture',
        to_kind: 'topic',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-synthesized',
        review_state: 'unreviewed',
        qualifiers: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('mentions edges must connect topic/section/source/evidence/assertion to entity or concept');
  });

  it('allows sections and assertions to connect to concepts', () => {
    expect(() =>
      createGraphEdge({
        edge_id: 'edge:mentions:section-1:concept-1',
        from_id: 'section:java-thread-context#1',
        from_kind: 'section',
        type: 'mentions',
        to_id: 'concept:thread-local-context-propagation',
        to_kind: 'concept',
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        created_at: '2026-04-25T00:00:00.000Z',
        updated_at: '2026-04-25T00:00:00.000Z'
      })
    ).not.toThrow();

    expect(() =>
      createGraphEdge({
        edge_id: 'edge:about:assertion-1:concept-1',
        from_id: 'assertion:context-propagation',
        from_kind: 'assertion',
        type: 'about',
        to_id: 'concept:thread-local-context-propagation',
        to_kind: 'concept',
        status: 'active',
        confidence: 'asserted',
        provenance: 'agent-synthesized',
        review_state: 'reviewed',
        created_at: '2026-04-25T00:00:00.000Z',
        updated_at: '2026-04-25T00:00:00.000Z'
      })
    ).not.toThrow();
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
