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
  const root = await loadGraphNode(client, rootId);

  if (!root) {
    return null;
  }

  const nodes = new Map<string, GraphNode>([[root.id, root]]);
  const edges = new Map<string, GraphEdge>();

  const rootOutgoingEdges = (await listOutgoingGraphEdges(client, root.id)).filter(
    (edge) =>
      edge.from_id === root.id &&
      edge.from_kind === 'topic' &&
      ['belongs_to_taxonomy', 'mentions'].includes(edge.type)
  );
  const rootIncomingEdges = (await listIncomingGraphEdges(client, root.id)).filter(
    (edge) =>
      edge.to_id === root.id &&
      ((edge.type === 'part_of' && edge.from_kind === 'section') ||
        (edge.type === 'about' && edge.from_kind === 'assertion'))
  );

  for (const edge of [...rootOutgoingEdges, ...rootIncomingEdges]) {
    edges.set(edge.edge_id, edge);
  }

  for (const edge of rootOutgoingEdges) {
    await addNodeIfPresent(client, edge.to_id, nodes);
  }

  const sectionIds: string[] = [];
  const assertionIds: string[] = [];

  for (const edge of rootIncomingEdges) {
    await addNodeIfPresent(client, edge.from_id, nodes);

    if (edge.type === 'part_of' && edge.from_kind === 'section') {
      sectionIds.push(edge.from_id);
    }

    if (edge.type === 'about' && edge.from_kind === 'assertion') {
      assertionIds.push(edge.from_id);
    }
  }

  const evidenceIds: string[] = [];

  for (const sectionId of sectionIds) {
    const sectionOutgoingEdges = (await listOutgoingGraphEdges(client, sectionId)).filter(
      (edge) =>
        edge.from_id === sectionId &&
        edge.from_kind === 'section' &&
        edge.type === 'grounded_by' &&
        edge.to_kind === 'evidence'
    );

    for (const edge of sectionOutgoingEdges) {
      edges.set(edge.edge_id, edge);
      evidenceIds.push(edge.to_id);
      await addNodeIfPresent(client, edge.to_id, nodes);
    }
  }

  for (const assertionId of assertionIds) {
    const assertionOutgoingEdges = (await listOutgoingGraphEdges(client, assertionId)).filter(
      (edge) =>
        edge.from_id === assertionId &&
        edge.from_kind === 'assertion' &&
        edge.type === 'supported_by' &&
        edge.to_kind === 'evidence'
    );

    for (const edge of assertionOutgoingEdges) {
      edges.set(edge.edge_id, edge);
      evidenceIds.push(edge.to_id);
      await addNodeIfPresent(client, edge.to_id, nodes);
    }
  }

  for (const evidenceId of [...new Set(evidenceIds)]) {
    const evidenceOutgoingEdges = (await listOutgoingGraphEdges(client, evidenceId)).filter(
      (edge) =>
        edge.from_id === evidenceId &&
        edge.from_kind === 'evidence' &&
        edge.type === 'derived_from' &&
        edge.to_kind === 'source'
    );

    for (const edge of evidenceOutgoingEdges) {
      edges.set(edge.edge_id, edge);
      await addNodeIfPresent(client, edge.to_id, nodes);
    }
  }

  return {
    rootId,
    nodes: [...nodes.values()],
    edges: [...edges.values()]
  };
}

async function addNodeIfPresent(
  client: GraphDatabaseClient,
  id: string,
  nodes: Map<string, GraphNode>
): Promise<void> {
  if (nodes.has(id)) {
    return;
  }

  const node = await loadGraphNode(client, id);

  if (node) {
    nodes.set(node.id, node);
  }
}
