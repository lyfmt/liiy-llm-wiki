import type { GraphEdge } from '../domain/graph-edge.js';
import type { GraphNode } from '../domain/graph-node.js';

import type { GraphDatabaseClient } from './graph-database.js';
import { listIncomingGraphEdges, listOutgoingGraphEdges, loadGraphNode } from './graph-store.js';

export interface TopicGraphProjectionInput {
  rootId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function loadTopicGraphProjectionInput(
  client: GraphDatabaseClient,
  slug: string
): Promise<TopicGraphProjectionInput | null> {
  const rootId = `topic:${slug}`;
  const root = await loadNodeIfPresent(client, rootId);

  if (!root) {
    return null;
  }

  const nodes = new Map<string, GraphNode>([[root.id, root]]);
  const edges = new Map<string, GraphEdge>();
  const pendingIds = [root.id];
  const visitedIds = new Set<string>();

  while (pendingIds.length > 0) {
    const currentId = pendingIds.shift()!;

    if (visitedIds.has(currentId)) {
      continue;
    }

    visitedIds.add(currentId);

    const currentNode = nodes.get(currentId) ?? (await addNodeIfPresent(client, currentId, nodes));

    if (!currentNode) {
      continue;
    }

    const relatedEdges = await listTraversalEdges(client, currentNode);

    for (const edge of relatedEdges) {
      if (!edges.has(edge.edge_id)) {
        edges.set(edge.edge_id, edge);
      }

      const relatedId = edge.from_id === currentNode.id ? edge.to_id : edge.from_id;
      const relatedNode = await addNodeIfPresent(client, relatedId, nodes);

      if (relatedNode && !visitedIds.has(relatedNode.id)) {
        pendingIds.push(relatedNode.id);
      }
    }
  }

  return {
    rootId,
    nodes: [...nodes.values()],
    edges: [...edges.values()]
  };
}

async function listTraversalEdges(client: GraphDatabaseClient, node: GraphNode): Promise<GraphEdge[]> {
  const traversed: GraphEdge[] = [];

  if (usesOutgoingTraversal(node.kind)) {
    const outgoingEdges = await listOutgoingGraphEdges(client, node.id);
    traversed.push(...outgoingEdges.filter((edge) => isOutgoingTraversalEdge(node, edge)));
  }

  if (usesIncomingTraversal(node.kind)) {
    const incomingEdges = await listIncomingGraphEdges(client, node.id);
    traversed.push(...incomingEdges.filter((edge) => isIncomingTraversalEdge(node, edge)));
  }

  return traversed;
}

function usesOutgoingTraversal(kind: GraphNode['kind']): boolean {
  return ['topic', 'taxonomy', 'section', 'assertion', 'evidence', 'source'].includes(kind);
}

function usesIncomingTraversal(kind: GraphNode['kind']): boolean {
  return ['topic', 'section', 'entity'].includes(kind);
}

function isOutgoingTraversalEdge(node: GraphNode, edge: GraphEdge): boolean {
  if (edge.from_id !== node.id || edge.from_kind !== node.kind) {
    return false;
  }

  switch (node.kind) {
    case 'topic':
      return (
        (edge.type === 'belongs_to_taxonomy' && edge.to_kind === 'taxonomy') ||
        (edge.type === 'mentions' && edge.to_kind === 'entity')
      );
    case 'taxonomy':
      return edge.type === 'part_of' && edge.to_kind === 'taxonomy';
    case 'section':
      return (
        (edge.type === 'grounded_by' && edge.to_kind === 'evidence') ||
        (edge.type === 'mentions' && edge.to_kind === 'entity')
      );
    case 'assertion':
      return (
        (edge.type === 'supported_by' && edge.to_kind === 'evidence') ||
        (edge.type === 'mentions' && edge.to_kind === 'entity')
      );
    case 'evidence':
      return (
        (edge.type === 'derived_from' && edge.to_kind === 'source') ||
        (edge.type === 'mentions' && edge.to_kind === 'entity')
      );
    case 'source':
      return edge.type === 'mentions' && edge.to_kind === 'entity';
    default:
      return false;
  }
}

function isIncomingTraversalEdge(node: GraphNode, edge: GraphEdge): boolean {
  if (edge.to_id !== node.id || edge.to_kind !== node.kind) {
    return false;
  }

  switch (node.kind) {
    case 'topic':
      return (
        (edge.type === 'part_of' && edge.from_kind === 'section') ||
        (edge.type === 'about' && edge.from_kind === 'assertion')
      );
    case 'section':
      return (
        (edge.type === 'part_of' && edge.from_kind === 'section') ||
        (edge.type === 'about' && edge.from_kind === 'assertion')
      );
    case 'entity':
      return edge.type === 'about' && edge.from_kind === 'assertion';
    default:
      return false;
  }
}

async function addNodeIfPresent(
  client: GraphDatabaseClient,
  id: string,
  nodes: Map<string, GraphNode>
): Promise<GraphNode | null> {
  const existing = nodes.get(id);

  if (existing) {
    return existing;
  }

  const node = await loadNodeIfPresent(client, id);

  if (node) {
    nodes.set(node.id, node);
    return node;
  }

  return null;
}

async function loadNodeIfPresent(client: GraphDatabaseClient, id: string): Promise<GraphNode | null> {
  return loadGraphNode(client, id);
}
