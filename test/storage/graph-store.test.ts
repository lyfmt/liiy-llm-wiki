import { describe, expect, it } from 'vitest';

import { createGraphEdge } from '../../src/domain/graph-edge.js';
import { createGraphNode } from '../../src/domain/graph-node.js';
import {
  listIncomingGraphEdges,
  listOutgoingGraphEdges,
  loadGraphNode,
  saveGraphEdge,
  saveGraphNode
} from '../../src/storage/graph-store.js';

describe('saveGraphNode', () => {
  it('persists a graph node through the database client', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        return { rows: [] };
      }
    };

    await saveGraphNode(
      client,
      createGraphNode({
        id: 'topic:design-patterns',
        kind: 'topic',
        title: 'Design Patterns',
        summary: 'Durable overview.',
        aliases: [],
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        retrieval_text: 'Design Patterns',
        attributes: { scope_note: 'Architecture topic.' },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );

    expect(calls[0]?.sql).toContain('insert into graph_nodes');
    expect(calls[0]?.sql).not.toContain('created_at = excluded.created_at');
    expect(calls[0]?.params[4]).toBe('[]');
    expect(calls[0]?.params[10]).toBe('{"scope_note":"Architecture topic."}');
  });

  it('loads null when the graph node is missing', async () => {
    const client = {
      query: async () => ({ rows: [] })
    };

    await expect(loadGraphNode(client, 'topic:missing')).resolves.toBeNull();
  });
});

describe('graph-store reads and writes edges', () => {
  it('persists a graph edge through the database client', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        return { rows: [] };
      }
    };

    await saveGraphEdge(
      client,
      createGraphEdge({
        edge_id: 'edge:supported-by:1',
        from_id: 'assertion:patterns-are-reusable',
        from_kind: 'assertion',
        type: 'supported_by',
        to_id: 'evidence:gof-book',
        to_kind: 'evidence',
        status: 'active',
        confidence: 'asserted',
        provenance: 'human-edited',
        review_state: 'reviewed',
        qualifiers: { chapter: 1 },
        created_at: '2026-04-19T00:00:00.000Z',
        updated_at: '2026-04-19T00:00:00.000Z'
      })
    );

    expect(calls[0]?.sql).toContain('insert into graph_edges');
    expect(calls[0]?.sql).not.toContain('created_at = excluded.created_at');
    expect(calls[0]?.params).toContain(0);
    expect(calls[0]?.params[11]).toBe('{"chapter":1}');
  });

  it('loads a graph node from the database client', async () => {
    const client = {
      query: async () => ({
        rows: [
          {
            id: 'topic:design-patterns',
            kind: 'topic',
            title: 'Design Patterns',
            summary: 'Durable overview.',
            aliases: ['GoF'],
            status: 'active',
            confidence: 'asserted',
            provenance: 'human-edited',
            review_state: 'reviewed',
            retrieval_text: 'Design Patterns GoF',
            attributes: { scope_note: 'Architecture topic.' },
            created_at: new Date('2026-04-19T00:00:00.000Z'),
            updated_at: new Date('2026-04-19T00:00:00.000Z')
          }
        ]
      })
    };

    const node = await loadGraphNode(client, 'topic:design-patterns');

    expect(node?.id).toBe('topic:design-patterns');
    expect(node?.aliases).toEqual(['GoF']);
    expect(node?.created_at).toBe('2026-04-19T00:00:00.000Z');
    expect(node?.updated_at).toBe('2026-04-19T00:00:00.000Z');
  });

  it('lists outgoing and incoming edges using the database client', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const edgeRow = {
      edge_id: 'edge:supported-by:1',
      from_id: 'assertion:patterns-are-reusable',
      from_kind: 'assertion',
      type: 'supported_by',
      to_id: 'evidence:gof-book',
      to_kind: 'evidence',
      status: 'active',
      confidence: 'asserted',
      provenance: 'human-edited',
      review_state: 'reviewed',
      qualifiers: { chapter: 1 },
      created_at: new Date('2026-04-19T00:00:00.000Z'),
      updated_at: new Date('2026-04-19T00:00:00.000Z')
    };
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        return { rows: [edgeRow] };
      }
    };

    const outgoing = await listOutgoingGraphEdges(client, 'assertion:patterns-are-reusable');
    const incoming = await listIncomingGraphEdges(client, 'evidence:gof-book');

    expect(calls[0]?.sql).toContain('from graph_edges');
    expect(calls[0]?.sql).toContain('where from_id = $1');
    expect(calls[1]?.sql).toContain('where to_id = $1');
    expect(outgoing[0]?.edge_id).toBe('edge:supported-by:1');
    expect(incoming[0]?.edge_id).toBe('edge:supported-by:1');
    expect(outgoing[0]?.created_at).toBe('2026-04-19T00:00:00.000Z');
    expect(incoming[0]?.updated_at).toBe('2026-04-19T00:00:00.000Z');
  });

  it('returns empty edge lists when the database has no matches', async () => {
    const client = {
      query: async () => ({ rows: [] })
    };

    await expect(listOutgoingGraphEdges(client, 'assertion:none')).resolves.toEqual([]);
    await expect(listIncomingGraphEdges(client, 'evidence:none')).resolves.toEqual([]);
  });
});
