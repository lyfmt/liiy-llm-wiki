import { describe, expect, it } from 'vitest';

import { createGraphEdge, createGraphNode, createSourceGroundedIngest } from '../../src/index.js';
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeKind, SourceGroundedIngest } from '../../src/index.js';

describe('new package entry exports', () => {
  it('re-exports graph domain constructors and public types', () => {
    expect(typeof createGraphNode).toBe('function');
    expect(typeof createGraphEdge).toBe('function');
    expect(typeof createSourceGroundedIngest).toBe('function');

    const nodeKind: GraphNodeKind = 'topic';
    const edgeType: GraphEdgeType = 'grounded_by';
    const node: GraphNode | null = null;
    const edge: GraphEdge | null = null;
    const ingest: SourceGroundedIngest | null = null;

    expect(nodeKind).toBe('topic');
    expect(edgeType).toBe('grounded_by');
    expect(node).toBeNull();
    expect(edge).toBeNull();
    expect(ingest).toBeNull();
  });
});
