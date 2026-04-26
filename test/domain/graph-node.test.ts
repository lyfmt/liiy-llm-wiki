import { describe, expect, it } from 'vitest';

import { createGraphNode } from '../../src/domain/graph-node.js';

describe('createGraphNode', () => {
  it('creates a topic node with normalized aliases and retrieval text', () => {
    const node = createGraphNode({
      id: 'topic:design-patterns',
      kind: 'topic',
      title: 'Design Patterns',
      summary: 'Durable overview of software design patterns.',
      aliases: [' GoF Patterns ', '', 'GoF Patterns', 'Patterns Catalog'],
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      retrieval_text: 'Design Patterns GoF Patterns durable overview',
      attributes: { scope_note: 'Software architecture topic.' },
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z'
    });

    expect(node.kind).toBe('topic');
    expect(node.aliases).toEqual(['GoF Patterns', 'Patterns Catalog']);
    expect(node.retrieval_text).toBe('Design Patterns GoF Patterns durable overview');
  });

  it('rejects evidence nodes without locator and excerpt', () => {
    expect(() =>
      createGraphNode({
        id: 'evidence:001',
        kind: 'evidence',
        title: 'Broken evidence',
        status: 'draft',
        confidence: 'weak',
        provenance: 'agent-extracted',
        review_state: 'unreviewed',
        retrieval_text: '',
        attributes: {},
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    ).toThrow('Evidence nodes require locator and excerpt');
  });

  it('creates concept nodes as first-class graph nodes', () => {
    const node = createGraphNode({
      id: 'concept:thread-local-context-propagation',
      kind: 'concept',
      title: '线程局部上下文传播',
      summary: '在并发执行边界上传递上下文信息的机制。',
      aliases: ['上下文传递'],
      status: 'active',
      confidence: 'asserted',
      provenance: 'agent-extracted',
      review_state: 'reviewed',
      attributes: { source_concept_id: 'concept-thread-local-context-propagation' },
      created_at: '2026-04-25T00:00:00.000Z',
      updated_at: '2026-04-25T00:00:00.000Z'
    });

    expect(node.kind).toBe('concept');
  });
});
