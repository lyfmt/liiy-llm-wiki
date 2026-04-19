import { describe, expect, it } from 'vitest';

import { createGraphEdge, createGraphNode } from '../../src/index.js';
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeKind } from '../../src/index.js';

describe('new package entry exports', () => {
  it('re-exports graph domain constructors and public types', () => {
    expect(typeof createGraphNode).toBe('function');
    expect(typeof createGraphEdge).toBe('function');

    const nodeKind: GraphNodeKind = 'topic';
    const edgeType: GraphEdgeType = 'supported_by';
    const node: GraphNode | null = null;
    const edge: GraphEdge | null = null;

    expect(nodeKind).toBe('topic');
    expect(edgeType).toBe('supported_by');
    expect(node).toBeNull();
    expect(edge).toBeNull();
  });
});
