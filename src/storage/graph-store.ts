import { createGraphEdge, type GraphEdge } from '../domain/graph-edge.js';
import { createGraphNode, type GraphNode } from '../domain/graph-node.js';

import type { GraphDatabaseClient } from './graph-database.js';

export async function saveGraphNode(client: GraphDatabaseClient, node: GraphNode): Promise<void> {
  await client.query(
    `
insert into graph_nodes (
  id,
  kind,
  title,
  summary,
  aliases,
  status,
  confidence,
  provenance,
  review_state,
  retrieval_text,
  attributes,
  created_at,
  updated_at
)
values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
on conflict (id) do update set
  kind = excluded.kind,
  title = excluded.title,
  summary = excluded.summary,
  aliases = excluded.aliases,
  status = excluded.status,
  confidence = excluded.confidence,
  provenance = excluded.provenance,
  review_state = excluded.review_state,
  retrieval_text = excluded.retrieval_text,
  attributes = excluded.attributes,
  updated_at = excluded.updated_at
`.trim(),
    toGraphNodeParams(node)
  );
}

export async function saveGraphEdge(client: GraphDatabaseClient, edge: GraphEdge): Promise<void> {
  await client.query(
    `
insert into graph_edges (
  edge_id,
  from_id,
  from_kind,
  type,
  to_id,
  to_kind,
  status,
  confidence,
  provenance,
  review_state,
  sort_order,
  qualifiers,
  created_at,
  updated_at
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
on conflict (edge_id) do update set
  from_id = excluded.from_id,
  from_kind = excluded.from_kind,
  type = excluded.type,
  to_id = excluded.to_id,
  to_kind = excluded.to_kind,
  status = excluded.status,
  confidence = excluded.confidence,
  provenance = excluded.provenance,
  review_state = excluded.review_state,
  sort_order = excluded.sort_order,
  qualifiers = excluded.qualifiers,
  updated_at = excluded.updated_at
`.trim(),
    toGraphEdgeParams(edge)
  );
}

export async function insertGraphNodeIfAbsent(client: GraphDatabaseClient, node: GraphNode): Promise<boolean> {
  const result = await client.query(
    `
insert into graph_nodes (
  id,
  kind,
  title,
  summary,
  aliases,
  status,
  confidence,
  provenance,
  review_state,
  retrieval_text,
  attributes,
  created_at,
  updated_at
)
values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
on conflict (id) do nothing
returning id
`.trim(),
    toGraphNodeParams(node)
  );

  return result.rows.length > 0;
}

export async function insertGraphEdgeIfAbsent(client: GraphDatabaseClient, edge: GraphEdge): Promise<boolean> {
  const result = await client.query(
    `
insert into graph_edges (
  edge_id,
  from_id,
  from_kind,
  type,
  to_id,
  to_kind,
  status,
  confidence,
  provenance,
  review_state,
  sort_order,
  qualifiers,
  created_at,
  updated_at
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
on conflict (edge_id) do nothing
returning edge_id
`.trim(),
    toGraphEdgeParams(edge)
  );

  return result.rows.length > 0;
}

export async function loadGraphNode(client: GraphDatabaseClient, id: string): Promise<GraphNode | null> {
  const result = await client.query(
    `
select
  id,
  kind,
  title,
  summary,
  aliases,
  status,
  confidence,
  provenance,
  review_state,
  retrieval_text,
  attributes,
  created_at,
  updated_at
from graph_nodes
where id = $1
limit 1
`.trim(),
    [id]
  );

  const row = result.rows[0];
  return row ? mapGraphNodeRow(row) : null;
}

export async function loadGraphEdge(client: GraphDatabaseClient, edgeId: string): Promise<GraphEdge | null> {
  const result = await client.query(
    `
select
  edge_id,
  from_id,
  from_kind,
  type,
  to_id,
  to_kind,
  status,
  confidence,
  provenance,
  review_state,
  qualifiers,
  created_at,
  updated_at
from graph_edges
where edge_id = $1
limit 1
`.trim(),
    [edgeId]
  );

  const row = result.rows[0];
  return row ? mapGraphEdgeRow(row) : null;
}

export async function listOutgoingGraphEdges(client: GraphDatabaseClient, fromId: string): Promise<GraphEdge[]> {
  const result = await client.query(
    `
select
  edge_id,
  from_id,
  from_kind,
  type,
  to_id,
  to_kind,
  status,
  confidence,
  provenance,
  review_state,
  qualifiers,
  created_at,
  updated_at
from graph_edges
where from_id = $1
order by sort_order asc, edge_id asc
`.trim(),
    [fromId]
  );

  return result.rows.map(mapGraphEdgeRow);
}

export async function listIncomingGraphEdges(client: GraphDatabaseClient, toId: string): Promise<GraphEdge[]> {
  const result = await client.query(
    `
select
  edge_id,
  from_id,
  from_kind,
  type,
  to_id,
  to_kind,
  status,
  confidence,
  provenance,
  review_state,
  qualifiers,
  created_at,
  updated_at
from graph_edges
where to_id = $1
order by sort_order asc, edge_id asc
`.trim(),
    [toId]
  );

  return result.rows.map(mapGraphEdgeRow);
}

function mapGraphNodeRow(row: Record<string, unknown>): GraphNode {
  return createGraphNode({
    id: String(row.id),
    kind: row.kind as GraphNode['kind'],
    title: String(row.title),
    summary: String(row.summary ?? ''),
    aliases: toStringArray(row.aliases),
    status: row.status as GraphNode['status'],
    confidence: row.confidence as GraphNode['confidence'],
    provenance: row.provenance as GraphNode['provenance'],
    review_state: row.review_state as GraphNode['review_state'],
    retrieval_text: String(row.retrieval_text ?? ''),
    attributes: toRecord(row.attributes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  });
}

function mapGraphEdgeRow(row: Record<string, unknown>): GraphEdge {
  return createGraphEdge({
    edge_id: String(row.edge_id),
    from_id: String(row.from_id),
    from_kind: row.from_kind as GraphEdge['from_kind'],
    type: row.type as GraphEdge['type'],
    to_id: String(row.to_id),
    to_kind: row.to_kind as GraphEdge['to_kind'],
    status: row.status as GraphEdge['status'],
    confidence: row.confidence as GraphEdge['confidence'],
    provenance: row.provenance as GraphEdge['provenance'],
    review_state: row.review_state as GraphEdge['review_state'],
    qualifiers: toRecord(row.qualifiers),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  });
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  return [];
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }

  return {};
}

function toGraphNodeParams(node: GraphNode): unknown[] {
  return [
    node.id,
    node.kind,
    node.title,
    node.summary,
    JSON.stringify(node.aliases),
    node.status,
    node.confidence,
    node.provenance,
    node.review_state,
    node.retrieval_text,
    JSON.stringify(node.attributes),
    node.created_at,
    node.updated_at
  ];
}

function toGraphEdgeParams(edge: GraphEdge): unknown[] {
  return [
    edge.edge_id,
    edge.from_id,
    edge.from_kind,
    edge.type,
    edge.to_id,
    edge.to_kind,
    edge.status,
    edge.confidence,
    edge.provenance,
    edge.review_state,
    0,
    JSON.stringify(edge.qualifiers),
    edge.created_at,
    edge.updated_at
  ];
}
