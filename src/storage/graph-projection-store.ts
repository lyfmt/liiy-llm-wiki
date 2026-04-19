import type { GraphEdge } from '../domain/graph-edge.js';
import type { GraphNode } from '../domain/graph-node.js';

export interface GraphProjection {
  root: GraphNode;
  taxonomy: GraphNode[];
  sections: GraphNode[];
  entities: GraphNode[];
  assertions: Array<{
    node: GraphNode;
    evidence: Array<{
      node: GraphNode;
      source: GraphNode | null;
    }>;
  }>;
  evidence: Array<{
    node: GraphNode;
    source: GraphNode | null;
  }>;
}

export interface BuildGraphProjectionInput {
  rootId: string;
  nodes: GraphNode[];
  edges: Array<GraphEdge | GraphAboutEdge>;
}

interface GraphAboutEdge {
  edge_id: string;
  from_id: string;
  from_kind: 'assertion';
  type: 'about';
  to_id: string;
  to_kind: 'topic' | 'section' | 'entity';
  status: GraphEdge['status'];
  confidence: GraphEdge['confidence'];
  provenance: GraphEdge['provenance'];
  review_state: GraphEdge['review_state'];
  qualifiers: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function buildGraphProjection(input: BuildGraphProjectionInput): GraphProjection {
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const root = nodesById.get(input.rootId);

  if (!root) {
    throw new Error(`Graph projection root not found: ${input.rootId}`);
  }

  const assertions = input.edges
    .filter((edge): edge is GraphAboutEdge => isAboutEdge(edge) && edge.to_id === root.id)
    .map((edge) => nodesById.get(edge.from_id))
    .filter((node): node is GraphNode => node?.kind === 'assertion')
    .map((assertionNode) => ({
      node: assertionNode,
      evidence: collectAssertionEvidence(assertionNode.id, input.edges, nodesById)
    }));

  return {
    root,
    taxonomy: [],
    sections: [],
    entities: [],
    assertions,
    evidence: dedupeEvidence(assertions.flatMap((assertion) => assertion.evidence))
  };
}

function collectAssertionEvidence(
  assertionId: string,
  edges: Array<GraphEdge | GraphAboutEdge>,
  nodesById: Map<string, GraphNode>
): Array<{ node: GraphNode; source: GraphNode | null }> {
  return edges
    .filter(
      (edge): edge is GraphEdge =>
        edge.type === 'supported_by' && edge.from_id === assertionId && edge.from_kind === 'assertion'
    )
    .map((edge) => {
      const evidenceNode = nodesById.get(edge.to_id);

      if (!evidenceNode || evidenceNode.kind !== 'evidence') {
        return null;
      }

      return {
        node: evidenceNode,
        source: findEvidenceSource(evidenceNode.id, edges, nodesById)
      };
    })
    .filter((entry): entry is { node: GraphNode; source: GraphNode | null } => entry !== null);
}

function findEvidenceSource(
  evidenceId: string,
  edges: Array<GraphEdge | GraphAboutEdge>,
  nodesById: Map<string, GraphNode>
): GraphNode | null {
  const sourceId = edges.find(
    (edge) =>
      edge.type === 'derived_from' && edge.from_id === evidenceId && edge.from_kind === 'evidence' && edge.to_kind === 'source'
  )?.to_id;

  if (!sourceId) {
    return null;
  }

  const sourceNode = nodesById.get(sourceId);
  return sourceNode?.kind === 'source' ? sourceNode : null;
}

function dedupeEvidence(
  entries: Array<{
    node: GraphNode;
    source: GraphNode | null;
  }>
): Array<{
  node: GraphNode;
  source: GraphNode | null;
}> {
  const unique = new Map<string, { node: GraphNode; source: GraphNode | null }>();

  for (const entry of entries) {
    unique.set(entry.node.id, entry);
  }

  return [...unique.values()];
}

function isAboutEdge(edge: GraphEdge | GraphAboutEdge): edge is GraphAboutEdge {
  return edge.type === 'about';
}
