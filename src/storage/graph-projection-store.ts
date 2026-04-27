import type { GraphEdge } from '../domain/graph-edge.js';
import type { GraphNode } from '../domain/graph-node.js';

export interface SectionGroundingSummary {
  source_paths: string[];
  locators: string[];
  anchor_count: number;
}

export interface GraphProjectionSection {
  node: GraphNode;
  grounding: SectionGroundingSummary;
}

export interface GraphProjection {
  root: GraphNode;
  edges?: GraphEdge[];
  taxonomy: GraphNode[];
  sections: GraphProjectionSection[];
  entities: GraphNode[];
  concepts?: GraphNode[];
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
  edges: GraphEdge[];
}

export function buildGraphProjection(input: BuildGraphProjectionInput): GraphProjection {
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const root = nodesById.get(input.rootId);

  if (!root) {
    throw new Error(`Graph projection root not found: ${input.rootId}`);
  }

  const edgesByFromId = groupEdgesById(input.edges, 'from_id');
  const edgesByToId = groupEdgesById(input.edges, 'to_id');
  const rootedNodeIds = collectRootedNodeIds(root.id, nodesById, edgesByFromId, edgesByToId);
  const rootedNodes = [...rootedNodeIds]
    .map((id) => nodesById.get(id))
    .filter((node): node is GraphNode => node !== undefined);
  const rootedEdges = input.edges.filter((edge) => rootedNodeIds.has(edge.from_id) && rootedNodeIds.has(edge.to_id));

  const sections = rootedNodes
    .filter((node): node is GraphNode => node.kind === 'section')
    .sort(compareNodes)
    .map((node) => ({
      node,
      grounding: collectSectionGrounding(node.id, rootedEdges, nodesById)
    }));

  const assertions = rootedNodes
    .filter((node): node is GraphNode => node.kind === 'assertion')
    .sort(compareNodes)
    .map((assertionNode) => ({
      node: assertionNode,
      evidence: collectAssertionEvidence(assertionNode.id, rootedEdges, nodesById)
    }));

  return {
    root,
    edges: rootedEdges,
    taxonomy: rootedNodes.filter((node): node is GraphNode => node.kind === 'taxonomy').sort(compareNodes),
    sections,
    entities: rootedNodes.filter((node): node is GraphNode => node.kind === 'entity').sort(compareNodes),
    concepts: rootedNodes.filter((node): node is GraphNode => node.kind === 'concept').sort(compareNodes),
    assertions,
    evidence: dedupeEvidence([
      ...sections.flatMap((section) => collectSectionEvidence(section.node.id, rootedEdges, nodesById)),
      ...assertions.flatMap((assertion) => assertion.evidence)
    ])
  };
}

function collectRootedNodeIds(
  rootId: string,
  nodesById: Map<string, GraphNode>,
  edgesByFromId: Map<string, GraphEdge[]>,
  edgesByToId: Map<string, GraphEdge[]>
): Set<string> {
  const rootedIds = new Set<string>([rootId]);
  const pendingIds = [rootId];

  while (pendingIds.length > 0) {
    const currentId = pendingIds.shift()!;
    const currentNode = nodesById.get(currentId);

    if (!currentNode) {
      continue;
    }

    for (const edge of listTraversalEdges(currentNode, edgesByFromId, edgesByToId)) {
      const relatedId = edge.from_id === currentNode.id ? edge.to_id : edge.from_id;

      if (rootedIds.has(relatedId) || !nodesById.has(relatedId)) {
        continue;
      }

      rootedIds.add(relatedId);
      pendingIds.push(relatedId);
    }
  }

  return rootedIds;
}

function listTraversalEdges(
  node: GraphNode,
  edgesByFromId: Map<string, GraphEdge[]>,
  edgesByToId: Map<string, GraphEdge[]>
): GraphEdge[] {
  const traversed: GraphEdge[] = [];

  if (usesOutgoingTraversal(node.kind)) {
    traversed.push(
      ...(edgesByFromId.get(node.id) ?? []).filter((edge) => isOutgoingTraversalEdge(node, edge))
    );
  }

  if (usesIncomingTraversal(node.kind)) {
    traversed.push(
      ...(edgesByToId.get(node.id) ?? []).filter((edge) => isIncomingTraversalEdge(node, edge))
    );
  }

  return traversed;
}

function usesOutgoingTraversal(kind: GraphNode['kind']): boolean {
  return ['topic', 'taxonomy', 'section', 'assertion', 'evidence', 'source'].includes(kind);
}

function usesIncomingTraversal(kind: GraphNode['kind']): boolean {
  return ['topic', 'section', 'entity', 'concept'].includes(kind);
}

function isOutgoingTraversalEdge(node: GraphNode, edge: GraphEdge): boolean {
  if (edge.from_id !== node.id || edge.from_kind !== node.kind) {
    return false;
  }

  switch (node.kind) {
    case 'topic':
      return (
        (edge.type === 'belongs_to_taxonomy' && edge.to_kind === 'taxonomy') ||
        (edge.type === 'mentions' && ['entity', 'concept'].includes(edge.to_kind))
      );
    case 'taxonomy':
      return edge.type === 'part_of' && edge.to_kind === 'taxonomy';
    case 'section':
      return (
        (edge.type === 'grounded_by' && edge.to_kind === 'evidence') ||
        (edge.type === 'mentions' && ['entity', 'concept'].includes(edge.to_kind))
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
      return edge.type === 'mentions' && ['entity', 'concept'].includes(edge.to_kind);
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
    case 'concept':
      return (
        (edge.type === 'mentions' && ['topic', 'section', 'source'].includes(edge.from_kind)) ||
        (edge.type === 'about' && edge.from_kind === 'assertion')
      );
    default:
      return false;
  }
}

function groupEdgesById(
  edges: GraphEdge[],
  key: 'from_id' | 'to_id'
): Map<string, GraphEdge[]> {
  const grouped = new Map<string, GraphEdge[]>();

  for (const edge of [...edges].sort(compareEdges)) {
    const edgeList = grouped.get(edge[key]) ?? [];
    edgeList.push(edge);
    grouped.set(edge[key], edgeList);
  }

  return grouped;
}

function collectAssertionEvidence(
  assertionId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): Array<{ node: GraphNode; source: GraphNode | null }> {
  return [...edges]
    .filter(
      (edge) => edge.type === 'supported_by' && edge.from_id === assertionId && edge.from_kind === 'assertion'
    )
    .sort(compareEdges)
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
    .filter((entry): entry is { node: GraphNode; source: GraphNode | null } => entry !== null)
    .sort((left, right) => compareNodes(left.node, right.node));
}

function collectSectionEvidence(
  sectionId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): Array<{ node: GraphNode; source: GraphNode | null }> {
  return [...edges]
    .filter(
      (edge) => edge.type === 'grounded_by' && edge.from_id === sectionId && edge.from_kind === 'section'
    )
    .sort(compareEdges)
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
    .filter((entry): entry is { node: GraphNode; source: GraphNode | null } => entry !== null)
    .sort((left, right) => compareNodes(left.node, right.node));
}

function collectSectionGrounding(
  sectionId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): SectionGroundingSummary {
  const groundedEvidence = collectSectionEvidence(sectionId, edges, nodesById);

  return {
    source_paths: collectUniqueStrings(
      groundedEvidence.map((entry) => extractSourcePath(entry.source)).filter((value): value is string => value !== null)
    ),
    locators: collectLocatorStrings(groundedEvidence),
    anchor_count: groundedEvidence.length
  };
}

function findEvidenceSource(
  evidenceId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): GraphNode | null {
  const sourceId = [...edges]
    .filter(
      (edge) =>
        edge.type === 'derived_from' &&
        edge.from_id === evidenceId &&
        edge.from_kind === 'evidence' &&
        edge.to_kind === 'source'
    )
    .sort(compareEdges)
    .find(() => true)
    ?.to_id;

  if (!sourceId) {
    return null;
  }

  const sourceNode = nodesById.get(sourceId);
  return sourceNode?.kind === 'source' ? sourceNode : null;
}

function extractSourcePath(source: GraphNode | null): string | null {
  const path = typeof source?.attributes.path === 'string' ? source.attributes.path.trim() : '';
  return path === '' ? null : path;
}

function extractLocator(node: GraphNode): string | null {
  const locator = typeof node.attributes.locator === 'string' ? node.attributes.locator.trim() : '';
  return locator === '' ? null : locator;
}

function collectUniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function collectLocatorStrings(entries: Array<{ node: GraphNode; source: GraphNode | null }>): string[] {
  return [...entries]
    .sort((left, right) => compareNodes(left.node, right.node))
    .map((entry) => extractLocator(entry.node))
    .filter((value): value is string => value !== null);
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return left.edge_id.localeCompare(right.edge_id);
}

function compareNodes(left: GraphNode, right: GraphNode): number {
  return left.id.localeCompare(right.id);
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

  for (const entry of [...entries].sort((left, right) => compareNodes(left.node, right.node))) {
    if (!unique.has(entry.node.id)) {
      unique.set(entry.node.id, entry);
    }
  }

  return [...unique.values()];
}
