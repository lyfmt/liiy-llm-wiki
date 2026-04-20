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
  taxonomy: GraphNode[];
  sections: GraphProjectionSection[];
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
  edges: GraphEdge[];
}

export function buildGraphProjection(input: BuildGraphProjectionInput): GraphProjection {
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const root = nodesById.get(input.rootId);

  if (!root) {
    throw new Error(`Graph projection root not found: ${input.rootId}`);
  }

  const assertions = [...input.edges]
    .filter((edge) => edge.type === 'about' && edge.to_id === root.id)
    .sort(compareEdges)
    .map((edge) => nodesById.get(edge.from_id))
    .filter((node): node is GraphNode => node?.kind === 'assertion')
    .sort(compareNodes)
    .map((assertionNode) => ({
      node: assertionNode,
      evidence: collectAssertionEvidence(assertionNode.id, input.edges, nodesById)
    }));

  return {
    root,
    taxonomy: collectTaxonomy(root.id, input.edges, nodesById),
    sections: collectSections(root.id, input.edges, nodesById),
    entities: collectEntities(root.id, input.edges, nodesById),
    assertions,
    evidence: dedupeEvidence(assertions.flatMap((assertion) => assertion.evidence))
  };
}

function collectTaxonomy(
  rootId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): GraphNode[] {
  return collectTargetNodes({
    edges,
    edgeFilter: (edge) => edge.type === 'belongs_to_taxonomy' && edge.from_id === rootId,
    nodeResolver: (edge) => nodesById.get(edge.to_id),
    nodeFilter: (node) => node.kind === 'taxonomy'
  });
}

function collectSections(
  rootId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): GraphProjectionSection[] {
  return collectTargetNodes({
    edges,
    edgeFilter: (edge) => edge.type === 'part_of' && edge.to_id === rootId && edge.from_kind === 'section',
    nodeResolver: (edge) => nodesById.get(edge.from_id),
    nodeFilter: (node) => node.kind === 'section'
  }).map((node) => ({
    node,
    grounding: collectSectionGrounding(node.id, edges, nodesById)
  }));
}

function collectEntities(
  rootId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): GraphNode[] {
  return collectTargetNodes({
    edges,
    edgeFilter: (edge) => edge.type === 'mentions' && edge.from_id === rootId,
    nodeResolver: (edge) => nodesById.get(edge.to_id),
    nodeFilter: (node) => node.kind === 'entity'
  });
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

function collectSectionGrounding(
  sectionId: string,
  edges: GraphEdge[],
  nodesById: Map<string, GraphNode>
): SectionGroundingSummary {
  const groundedEvidence = [...edges]
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
    .filter((entry): entry is { node: GraphNode; source: GraphNode | null } => entry !== null);

  return {
    source_paths: collectUniqueStrings(
      groundedEvidence.map((entry) => extractSourcePath(entry.source)).filter((value): value is string => value !== null)
    ),
    locators: collectUniqueStrings(
      groundedEvidence.map((entry) => extractLocator(entry.node)).filter((value): value is string => value !== null)
    ),
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

function collectTargetNodes(input: {
  edges: GraphEdge[];
  edgeFilter: (edge: GraphEdge) => boolean;
  nodeResolver: (edge: GraphEdge) => GraphNode | undefined;
  nodeFilter: (node: GraphNode) => boolean;
}): GraphNode[] {
  const unique = new Map<string, GraphNode>();

  for (const edge of [...input.edges].filter(input.edgeFilter).sort(compareEdges)) {
    const node = input.nodeResolver(edge);

    if (!node || !input.nodeFilter(node) || unique.has(node.id)) {
      continue;
    }

    unique.set(node.id, node);
  }

  return [...unique.values()].sort(compareNodes);
}
