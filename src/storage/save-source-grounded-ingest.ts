import path from 'node:path';

import { createGraphEdge, type GraphEdge } from '../domain/graph-edge.js';
import { createGraphNode, type GraphNode } from '../domain/graph-node.js';
import type { SourceGroundedIngest } from '../domain/source-grounded-ingest.js';

import type { GraphDatabaseClient } from './graph-database.js';
import { insertGraphEdgeIfAbsent, insertGraphNodeIfAbsent, loadGraphEdge, loadGraphNode } from './graph-store.js';

export const SOURCE_GROUNDED_INGEST_CONFLICT = 'SOURCE_GROUNDED_INGEST_CONFLICT';

type SourceGroundedIngestConflictEntityKind = 'topic' | 'section' | 'evidence' | 'source' | 'edge';

export class SourceGroundedIngestConflictError extends Error {
  readonly code = SOURCE_GROUNDED_INGEST_CONFLICT;

  constructor(
    readonly entityKind: SourceGroundedIngestConflictEntityKind,
    readonly entityId: string,
    message: string
  ) {
    super(message);
    this.name = 'SourceGroundedIngestConflictError';
  }
}

export async function saveSourceGroundedIngest(
  client: GraphDatabaseClient,
  ingest: SourceGroundedIngest,
  savedAt = new Date().toISOString()
): Promise<void> {
  await runInTransaction(client, async (transactionClient) => {
    const sourceNode = buildSourceNode(ingest, savedAt);
    const topicNode = buildTopicNode(ingest, savedAt);
    const evidenceNodes = dedupeNodesById(
      ingest.evidence.map((evidence) => buildEvidenceNode(evidence, savedAt)),
      'evidence'
    );
    const sectionNodes = dedupeNodesById(
      ingest.sections.map((section) => buildSectionNode(section, savedAt)),
      'section'
    );

    const nodePlans = [
      { entityKind: 'source' as const, node: sourceNode },
      { entityKind: 'topic' as const, node: topicNode },
      ...evidenceNodes.map((node) => ({ entityKind: 'evidence' as const, node })),
      ...sectionNodes.map((node) => ({ entityKind: 'section' as const, node }))
    ];

    for (const plan of nodePlans) {
      const inserted = await insertGraphNodeIfAbsent(transactionClient, plan.node);

      if (inserted) {
        continue;
      }

      const existingNode = await loadGraphNode(transactionClient, plan.node.id);

      if (!existingNode || !nodesHaveSameContent(existingNode, plan.node)) {
        throw new SourceGroundedIngestConflictError(
          plan.entityKind,
          plan.node.id,
          `Conflicting ${plan.entityKind} node already exists: ${plan.node.id}`
        );
      }
    }

    const desiredEdges = [
      ...sectionNodes.map((sectionNode) => buildPartOfEdge(sectionNode.id, ingest.topic.id, savedAt)),
      ...sectionNodes.flatMap((sectionNode) =>
        getGroundedEvidenceIds(sectionNode).map((evidenceId) => buildGroundedByEdge(sectionNode.id, evidenceId, savedAt))
      ),
      ...evidenceNodes.map((evidenceNode) => buildDerivedFromEdge(evidenceNode.id, sourceNode.id, savedAt))
    ];

    for (const edge of desiredEdges) {
      const inserted = await insertGraphEdgeIfAbsent(transactionClient, edge);

      if (inserted) {
        continue;
      }

      const existingEdge = await loadGraphEdge(transactionClient, edge.edge_id);

      if (!existingEdge || !edgesHaveSameContent(existingEdge, edge)) {
        throw new SourceGroundedIngestConflictError('edge', edge.edge_id, `Conflicting edge already exists: ${edge.edge_id}`);
      }
    }
  });
}

function buildTopicNode(ingest: SourceGroundedIngest, savedAt: string): GraphNode {
  return createGraphNode({
    id: ingest.topic.id,
    kind: 'topic',
    title: ingest.topic.title,
    summary: ingest.topic.summary,
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-synthesized',
    review_state: 'reviewed',
    retrieval_text: [ingest.topic.title, ingest.topic.summary].join('\n'),
    attributes: {
      slug: ingest.topic.slug
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildSectionNode(section: SourceGroundedIngest['sections'][number], savedAt: string): GraphNode {
  return createGraphNode({
    id: section.id,
    kind: 'section',
    title: section.title,
    summary: section.summary,
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-synthesized',
    review_state: 'reviewed',
    retrieval_text: [section.title, section.summary].join('\n'),
    attributes: {
      grounded_evidence_ids: section.grounded_evidence_ids
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildEvidenceNode(evidence: SourceGroundedIngest['evidence'][number], savedAt: string): GraphNode {
  return createGraphNode({
    id: evidence.id,
    kind: 'evidence',
    title: evidence.title,
    summary: evidence.excerpt,
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    retrieval_text: [evidence.title, evidence.excerpt].join('\n'),
    attributes: {
      locator: evidence.locator,
      excerpt: evidence.excerpt,
      order: evidence.order,
      heading_path: evidence.heading_path
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildSourceNode(ingest: SourceGroundedIngest, savedAt: string): GraphNode {
  return createGraphNode({
    id: `source:${ingest.sourceId}`,
    kind: 'source',
    title: path.posix.basename(ingest.sourcePath),
    summary: '',
    aliases: [],
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    retrieval_text: ingest.sourcePath,
    attributes: {
      path: ingest.sourcePath,
      source_id: ingest.sourceId
    },
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildPartOfEdge(sectionId: string, topicId: string, savedAt: string): GraphEdge {
  return createGraphEdge({
    edge_id: createStableEdgeId('part_of', sectionId, topicId),
    from_id: sectionId,
    from_kind: 'section',
    type: 'part_of',
    to_id: topicId,
    to_kind: 'topic',
    status: 'active',
    confidence: 'asserted',
    provenance: 'agent-synthesized',
    review_state: 'reviewed',
    qualifiers: {},
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildGroundedByEdge(sectionId: string, evidenceId: string, savedAt: string): GraphEdge {
  return createGraphEdge({
    edge_id: createStableEdgeId('grounded_by', sectionId, evidenceId),
    from_id: sectionId,
    from_kind: 'section',
    type: 'grounded_by',
    to_id: evidenceId,
    to_kind: 'evidence',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    qualifiers: {},
    created_at: savedAt,
    updated_at: savedAt
  });
}

function buildDerivedFromEdge(evidenceId: string, sourceId: string, savedAt: string): GraphEdge {
  return createGraphEdge({
    edge_id: createStableEdgeId('derived_from', evidenceId, sourceId),
    from_id: evidenceId,
    from_kind: 'evidence',
    type: 'derived_from',
    to_id: sourceId,
    to_kind: 'source',
    status: 'active',
    confidence: 'asserted',
    provenance: 'source-derived',
    review_state: 'reviewed',
    qualifiers: {},
    created_at: savedAt,
    updated_at: savedAt
  });
}

function dedupeNodesById<TNode extends GraphNode>(
  nodes: TNode[],
  entityKind: Extract<SourceGroundedIngestConflictEntityKind, 'section' | 'evidence'>
): TNode[] {
  const nodesById = new Map<string, TNode>();

  for (const node of nodes) {
    const existingNode = nodesById.get(node.id);

    if (!existingNode) {
      nodesById.set(node.id, node);
      continue;
    }

    if (!nodesHaveSameContent(existingNode, node)) {
      throw new SourceGroundedIngestConflictError(entityKind, node.id, `Conflicting ${entityKind} node in ingest payload: ${node.id}`);
    }
  }

  return [...nodesById.values()];
}

function createStableEdgeId(type: GraphEdge['type'], fromId: string, toId: string): string {
  return `edge:${type}:${fromId}->${toId}`;
}

function getGroundedEvidenceIds(sectionNode: GraphNode): string[] {
  const groundedEvidenceIds = sectionNode.attributes.grounded_evidence_ids;

  return Array.isArray(groundedEvidenceIds) ? groundedEvidenceIds.map((value) => String(value)) : [];
}

function nodesHaveSameContent(existingNode: GraphNode, desiredNode: GraphNode): boolean {
  return stableStringify(toComparableNode(existingNode)) === stableStringify(toComparableNode(desiredNode));
}

function edgesHaveSameContent(existingEdge: GraphEdge, desiredEdge: GraphEdge): boolean {
  return stableStringify(toComparableEdge(existingEdge)) === stableStringify(toComparableEdge(desiredEdge));
}

function toComparableNode(node: GraphNode): Record<string, unknown> {
  switch (node.kind) {
    case 'topic':
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        slug: node.attributes.slug
      };
    case 'section':
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        grounded_evidence_ids: node.attributes.grounded_evidence_ids ?? []
      };
    case 'evidence':
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        retrieval_text: node.retrieval_text,
        locator: node.attributes.locator,
        excerpt: node.attributes.excerpt,
        order: node.attributes.order,
        heading_path: node.attributes.heading_path ?? []
      };
    case 'source':
      return {
        id: node.id,
        kind: node.kind,
        path: node.attributes.path,
        source_id: node.attributes.source_id
      };
    default:
      return {
        id: node.id,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        attributes: node.attributes
      };
  }
}

function toComparableEdge(edge: GraphEdge): Record<string, unknown> {
  return {
    edge_id: edge.edge_id,
    from_id: edge.from_id,
    from_kind: edge.from_kind,
    type: edge.type,
    to_id: edge.to_id,
    to_kind: edge.to_kind,
    qualifiers: edge.qualifiers
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
