import type { KnowledgeInsertGraphWrite } from '../domain/knowledge-insert-graph-write.js';
import type { GraphEdge } from '../domain/graph-edge.js';
import type { GraphNode } from '../domain/graph-node.js';

import type { GraphDatabaseClient } from './graph-database.js';
import {
  insertGraphEdgeIfAbsent,
  insertGraphNodeIfAbsent,
  listIncomingGraphEdges,
  listOutgoingGraphEdges,
  loadGraphEdge,
  loadGraphNode,
  saveGraphNode
} from './graph-store.js';

export const KNOWLEDGE_INSERT_GRAPH_WRITE_CONFLICT = 'KNOWLEDGE_INSERT_GRAPH_WRITE_CONFLICT';

type KnowledgeInsertGraphWriteConflictEntityKind = GraphNode['kind'] | 'edge';

export class KnowledgeInsertGraphWriteConflictError extends Error {
  readonly code = KNOWLEDGE_INSERT_GRAPH_WRITE_CONFLICT;

  constructor(
    readonly entityKind: KnowledgeInsertGraphWriteConflictEntityKind,
    readonly entityId: string,
    message: string
  ) {
    super(message);
    this.name = 'KnowledgeInsertGraphWriteConflictError';
  }
}

export interface KnowledgeInsertSemanticMergeCandidate {
  existingNode: GraphNode;
  desiredNode: GraphNode;
  mergedNode: GraphNode;
}

export interface KnowledgeInsertGraphWriteOptions {
  semanticMergeQueue?: {
    enqueue: (candidate: KnowledgeInsertSemanticMergeCandidate) => Promise<void> | void;
  };
}

export async function saveKnowledgeInsertGraphWrite(
  client: GraphDatabaseClient,
  graphWrite: KnowledgeInsertGraphWrite,
  savedAt?: string,
  options: KnowledgeInsertGraphWriteOptions = {}
): Promise<void> {
  const nodes = dedupeNodesById(
    graphWrite.nodes.map((node) => applySavedAt(node, savedAt)),
    'node'
  );
  const edges = dedupeEdgesById(
    graphWrite.edges.map((edge) => applySavedAt(edge, savedAt)),
    'edge'
  );

  await runInTransaction(client, async (transactionClient) => {
    await assertNoAlternativeTopicGraph(transactionClient, graphWrite);

    for (const node of nodes) {
      const inserted = await insertGraphNodeIfAbsent(transactionClient, node);

      if (inserted) {
        continue;
      }

      const existingNode = await loadGraphNode(transactionClient, node.id);

      if (!existingNode) {
        throw new KnowledgeInsertGraphWriteConflictError(
          node.kind,
          node.id,
          `Conflicting ${node.kind} node already exists: ${node.id}`
        );
      }

      if (nodesHaveSameContent(existingNode, node)) {
        continue;
      }

      if (nodesCanBeMergedAsSemanticCandidates(existingNode, node)) {
        const mergedNode = mergeSemanticNode(existingNode, node);
        await options.semanticMergeQueue?.enqueue({ existingNode, desiredNode: node, mergedNode });
        await saveGraphNode(transactionClient, mergedNode);
        continue;
      }

      throw new KnowledgeInsertGraphWriteConflictError(
        node.kind,
        node.id,
        `Conflicting ${node.kind} node already exists: ${node.id}`
      );
    }

    for (const edge of edges) {
      const inserted = await insertGraphEdgeIfAbsent(transactionClient, edge);

      if (inserted) {
        continue;
      }

      const existingEdge = await loadGraphEdge(transactionClient, edge.edge_id);

      if (!existingEdge || !edgesHaveSameContent(existingEdge, edge)) {
        throw new KnowledgeInsertGraphWriteConflictError('edge', edge.edge_id, `Conflicting edge already exists: ${edge.edge_id}`);
      }
    }
  });
}

async function assertNoAlternativeTopicGraph(
  client: GraphDatabaseClient,
  graphWrite: KnowledgeInsertGraphWrite
): Promise<void> {
  const connectedTopicIds = await findConnectedTopicIdsForSource(client, graphWrite.sourceId);
  const expectedTopicIds = new Set(graphWrite.topicIds);
  const alternativeTopicIds = connectedTopicIds.filter((topicId) => !expectedTopicIds.has(topicId));

  if (alternativeTopicIds.length === 0) {
    return;
  }

  const conflictingTopicId = alternativeTopicIds[0]!;
  throw new KnowledgeInsertGraphWriteConflictError(
    'topic',
    conflictingTopicId,
    `Conflicting topic node already exists for source ${graphWrite.sourceId} under a different id: ${conflictingTopicId}`
  );
}

async function findConnectedTopicIdsForSource(client: GraphDatabaseClient, sourceId: string): Promise<string[]> {
  const pendingSectionIds: string[] = [];
  const pendingAssertionIds: string[] = [];
  const sectionIds = new Set<string>();
  const assertionIds = new Set<string>();
  const topicIds = new Set<string>();
  const incomingSourceEdges = await listIncomingGraphEdges(client, sourceId);

  for (const edge of incomingSourceEdges) {
    if (edge.type !== 'derived_from' || edge.from_kind !== 'evidence' || edge.to_kind !== 'source') {
      continue;
    }

    const incomingEvidenceEdges = await listIncomingGraphEdges(client, edge.from_id);

    for (const evidenceEdge of incomingEvidenceEdges) {
      if (evidenceEdge.type === 'grounded_by' && evidenceEdge.from_kind === 'section' && evidenceEdge.to_kind === 'evidence') {
        if (!sectionIds.has(evidenceEdge.from_id)) {
          sectionIds.add(evidenceEdge.from_id);
          pendingSectionIds.push(evidenceEdge.from_id);
        }
      }

      if (evidenceEdge.type === 'supported_by' && evidenceEdge.from_kind === 'assertion' && evidenceEdge.to_kind === 'evidence') {
        if (!assertionIds.has(evidenceEdge.from_id)) {
          assertionIds.add(evidenceEdge.from_id);
          pendingAssertionIds.push(evidenceEdge.from_id);
        }
      }
    }
  }

  while (pendingAssertionIds.length > 0) {
    const assertionId = pendingAssertionIds.shift()!;
    const outgoingAssertionEdges = await listOutgoingGraphEdges(client, assertionId);

    for (const edge of outgoingAssertionEdges) {
      if (edge.type !== 'about' || edge.from_kind !== 'assertion') {
        continue;
      }

      if (edge.to_kind === 'topic') {
        topicIds.add(edge.to_id);
      }

      if (edge.to_kind === 'section' && !sectionIds.has(edge.to_id)) {
        sectionIds.add(edge.to_id);
        pendingSectionIds.push(edge.to_id);
      }
    }
  }

  while (pendingSectionIds.length > 0) {
    const sectionId = pendingSectionIds.shift()!;
    const outgoingSectionEdges = await listOutgoingGraphEdges(client, sectionId);

    for (const edge of outgoingSectionEdges) {
      if (edge.type !== 'part_of' || edge.from_kind !== 'section') {
        continue;
      }

      if (edge.to_kind === 'topic') {
        topicIds.add(edge.to_id);
      }

      if (edge.to_kind === 'section' && !sectionIds.has(edge.to_id)) {
        sectionIds.add(edge.to_id);
        pendingSectionIds.push(edge.to_id);
      }
    }
  }

  return [...topicIds].sort((left, right) => left.localeCompare(right));
}

function dedupeNodesById(nodes: GraphNode[], entityKind: 'node'): GraphNode[] {
  const nodesById = new Map<string, GraphNode>();

  for (const node of nodes) {
    const existingNode = nodesById.get(node.id);

    if (!existingNode) {
      nodesById.set(node.id, node);
      continue;
    }

    if (!nodesHaveSameContent(existingNode, node)) {
      throw new KnowledgeInsertGraphWriteConflictError(
        node.kind,
        node.id,
        `Conflicting ${entityKind} payload contains multiple node shapes: ${node.id}`
      );
    }
  }

  return [...nodesById.values()];
}

function dedupeEdgesById(edges: GraphEdge[], entityKind: 'edge'): GraphEdge[] {
  const edgesById = new Map<string, GraphEdge>();

  for (const edge of edges) {
    const existingEdge = edgesById.get(edge.edge_id);

    if (!existingEdge) {
      edgesById.set(edge.edge_id, edge);
      continue;
    }

    if (!edgesHaveSameContent(existingEdge, edge)) {
      throw new KnowledgeInsertGraphWriteConflictError(
        entityKind,
        edge.edge_id,
        `Conflicting ${entityKind} payload contains multiple edge shapes: ${edge.edge_id}`
      );
    }
  }

  return [...edgesById.values()];
}

function applySavedAt<T extends GraphNode | GraphEdge>(value: T, savedAt: string | undefined): T {
  if (!savedAt) {
    return value;
  }

  return {
    ...value,
    created_at: savedAt,
    updated_at: savedAt
  };
}

function nodesHaveSameContent(existingNode: GraphNode, desiredNode: GraphNode): boolean {
  return stableStringify(toComparableNode(existingNode)) === stableStringify(toComparableNode(desiredNode));
}

function nodesCanBeMergedAsSemanticCandidates(existingNode: GraphNode, desiredNode: GraphNode): boolean {
  if (existingNode.id !== desiredNode.id || existingNode.kind !== desiredNode.kind) {
    return false;
  }

  if (existingNode.kind !== 'concept' && existingNode.kind !== 'entity') {
    return false;
  }

  return normalizeTitle(existingNode.title) === normalizeTitle(desiredNode.title);
}

function mergeSemanticNode(existingNode: GraphNode, desiredNode: GraphNode): GraphNode {
  const summary = mergeText(existingNode.summary, desiredNode.summary);
  return {
    ...existingNode,
    summary,
    aliases: uniqueStrings([...existingNode.aliases, ...desiredNode.aliases]),
    retrieval_text: mergeText(existingNode.retrieval_text, desiredNode.retrieval_text) || `${existingNode.title}\n${summary}`.trim(),
    attributes: {
      ...existingNode.attributes,
      ...desiredNode.attributes
    },
    updated_at: desiredNode.updated_at
  };
}

function mergeText(left: string, right: string): string {
  return uniqueStrings([left.trim(), right.trim()]).join('\n\n');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function edgesHaveSameContent(existingEdge: GraphEdge, desiredEdge: GraphEdge): boolean {
  return stableStringify(toComparableEdge(existingEdge)) === stableStringify(toComparableEdge(desiredEdge));
}

function toComparableNode(node: GraphNode): Record<string, unknown> {
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    summary: node.summary,
    aliases: node.aliases,
    status: node.status,
    confidence: node.confidence,
    provenance: node.provenance,
    review_state: node.review_state,
    retrieval_text: node.retrieval_text,
    attributes: node.attributes
  };
}

function toComparableEdge(edge: GraphEdge): Record<string, unknown> {
  return {
    edge_id: edge.edge_id,
    from_id: edge.from_id,
    from_kind: edge.from_kind,
    type: edge.type,
    to_id: edge.to_id,
    to_kind: edge.to_kind,
    qualifiers: edge.qualifiers,
    status: edge.status,
    confidence: edge.confidence,
    provenance: edge.provenance,
    review_state: edge.review_state
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortValue((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }

  return value;
}

async function runInTransaction<T>(
  client: GraphDatabaseClient,
  work: (transactionClient: GraphDatabaseClient) => Promise<T>
): Promise<T> {
  if (typeof client.transaction === 'function') {
    return client.transaction(work);
  }

  return work(client);
}
