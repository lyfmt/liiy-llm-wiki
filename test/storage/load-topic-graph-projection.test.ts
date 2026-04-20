import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode, type GraphNode } from '../../src/domain/graph-node.js';
import type { GraphDatabaseClient } from '../../src/storage/graph-database.js';
import { loadTopicGraphProjectionInput } from '../../src/storage/load-topic-graph-projection.js';

describe('loadTopicGraphProjectionInput', () => {
  it('loads the topic neighborhood needed by buildGraphProjection', async () => {
    const taxonomy = createNode({
      id: 'taxonomy:engineering',
      kind: 'taxonomy',
      title: 'Engineering'
    });
    const topic = createNode({
      id: 'topic:patch-first',
      kind: 'topic',
      title: 'Patch First'
    });
    const section = createNode({
      id: 'section:patch-first-overview',
      kind: 'section',
      title: 'Patch First Overview'
    });
    const entity = createNode({
      id: 'entity:graph-reader',
      kind: 'entity',
      title: 'Graph Reader'
    });
    const assertion = createNode({
      id: 'assertion:patch-first-stability',
      kind: 'assertion',
      title: 'Patch-first graph reads stay stable'
    });
    const evidence = createNode({
      id: 'evidence:patch-first-spec',
      kind: 'evidence',
      title: 'Patch First Spec',
      provenance: 'source-derived',
      attributes: {
        locator: 'spec.md#patch-first',
        excerpt: 'Load enough neighbors to build the projection.'
      }
    });
    const source = createNode({
      id: 'source:patch-first-spec',
      kind: 'source',
      title: 'Patch First Source'
    });
    const unrelatedTopic = createNode({
      id: 'topic:unrelated',
      kind: 'topic',
      title: 'Unrelated'
    });

    const client = createFakeGraphClient({
      nodes: [taxonomy, topic, section, entity, assertion, evidence, source, unrelatedTopic],
      edges: [
        createEdge({
          edge_id: 'edge:belongs-to-taxonomy:patch-first',
          from_id: topic.id,
          from_kind: 'topic',
          type: 'belongs_to_taxonomy',
          to_id: taxonomy.id,
          to_kind: 'taxonomy'
        }),
        createEdge({
          edge_id: 'edge:mentions:patch-first',
          from_id: topic.id,
          from_kind: 'topic',
          type: 'mentions',
          to_id: entity.id,
          to_kind: 'entity'
        }),
        createEdge({
          edge_id: 'edge:part-of:patch-first',
          from_id: section.id,
          from_kind: 'section',
          type: 'part_of',
          to_id: topic.id,
          to_kind: 'topic'
        }),
        createEdge({
          edge_id: 'edge:about:patch-first',
          from_id: assertion.id,
          from_kind: 'assertion',
          type: 'about',
          to_id: topic.id,
          to_kind: 'topic'
        }),
        createEdge({
          edge_id: 'edge:supported-by:patch-first',
          from_id: assertion.id,
          from_kind: 'assertion',
          type: 'supported_by',
          to_id: evidence.id,
          to_kind: 'evidence'
        }),
        createEdge({
          edge_id: 'edge:derived-from:patch-first',
          from_id: evidence.id,
          from_kind: 'evidence',
          type: 'derived_from',
          to_id: source.id,
          to_kind: 'source'
        }),
        createEdge({
          edge_id: 'edge:mentions:unrelated',
          from_id: unrelatedTopic.id,
          from_kind: 'topic',
          type: 'mentions',
          to_id: entity.id,
          to_kind: 'entity'
        })
      ]
    });

    const result = await loadTopicGraphProjectionInput(client, 'patch-first');

    expect(result?.rootId).toBe('topic:patch-first');
    expect(result?.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'topic:patch-first',
        'taxonomy:engineering',
        'section:patch-first-overview',
        'entity:graph-reader',
        'assertion:patch-first-stability',
        'evidence:patch-first-spec',
        'source:patch-first-spec'
      ])
    );
    expect(result?.edges.map((edge) => edge.type)).toEqual(
      expect.arrayContaining([
        'belongs_to_taxonomy',
        'part_of',
        'mentions',
        'about',
        'supported_by',
        'derived_from'
      ])
    );
    expect(result?.nodes).toHaveLength(7);
    expect(result?.edges).toHaveLength(6);
    expect(client.calls).toEqual([
      'node:topic:patch-first',
      'outgoing:topic:patch-first',
      'incoming:topic:patch-first',
      'node:taxonomy:engineering',
      'node:entity:graph-reader',
      'node:section:patch-first-overview',
      'node:assertion:patch-first-stability',
      'outgoing:assertion:patch-first-stability',
      'node:evidence:patch-first-spec',
      'outgoing:evidence:patch-first-spec',
      'node:source:patch-first-spec'
    ]);
  });

  it('returns null when the topic root is missing', async () => {
    const client = createFakeGraphClient({ nodes: [], edges: [] });

    await expect(loadTopicGraphProjectionInput(client, 'missing')).resolves.toBeNull();
    expect(client.calls).toEqual(['node:topic:missing']);
  });
});

function createNode(input: {
  id: string;
  kind: GraphNode['kind'];
  title: string;
  provenance?: GraphNode['provenance'];
  attributes?: Record<string, unknown>;
}): GraphNode {
  return createGraphNode({
    id: input.id,
    kind: input.kind,
    title: input.title,
    status: 'active',
    confidence: 'asserted',
    provenance: input.provenance ?? 'human-edited',
    review_state: 'reviewed',
    retrieval_text: input.title,
    attributes: input.attributes ?? {},
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
}

function createEdge(input: {
  edge_id: string;
  from_id: string;
  from_kind: Parameters<typeof createGraphEdge>[0]['from_kind'];
  type: Parameters<typeof createGraphEdge>[0]['type'];
  to_id: string;
  to_kind: Parameters<typeof createGraphEdge>[0]['to_kind'];
}) {
  return createGraphEdge({
    ...input,
    status: 'active',
    confidence: 'asserted',
    provenance: input.type === 'derived_from' ? 'source-derived' : 'human-edited',
    review_state: 'reviewed',
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z'
  });
}

function createFakeGraphClient(input: {
  nodes: GraphNode[];
  edges: ReturnType<typeof createEdge>[];
}): GraphDatabaseClient & { calls: string[] } {
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const edgesByFromId = new Map<string, ReturnType<typeof createEdge>[]>();
  const edgesByToId = new Map<string, ReturnType<typeof createEdge>[]>();
  const calls: string[] = [];

  for (const edge of input.edges) {
    const outgoing = edgesByFromId.get(edge.from_id) ?? [];
    outgoing.push(edge);
    edgesByFromId.set(edge.from_id, outgoing);

    const incoming = edgesByToId.get(edge.to_id) ?? [];
    incoming.push(edge);
    edgesByToId.set(edge.to_id, incoming);
  }

  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      const id = String(params?.[0] ?? '');

      if (sql.includes('from graph_nodes') && sql.includes('where id = $1')) {
        calls.push(`node:${id}`);
        return { rows: nodesById.has(id) ? [nodesById.get(id) as GraphNode] : [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where from_id = $1')) {
        calls.push(`outgoing:${id}`);
        return { rows: edgesByFromId.get(id) ?? [] };
      }

      if (sql.includes('from graph_edges') && sql.includes('where to_id = $1')) {
        calls.push(`incoming:${id}`);
        return { rows: edgesByToId.get(id) ?? [] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}
