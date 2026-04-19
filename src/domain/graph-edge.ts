import type { GraphConfidence, GraphNodeKind, GraphProvenance, GraphReviewState, GraphStatus } from './graph-node.js';

export type GraphEdgeType = 'supported_by' | 'derived_from' | 'belongs_to_taxonomy';

export interface GraphEdge {
  edge_id: string;
  from_id: string;
  from_kind: GraphNodeKind;
  type: GraphEdgeType;
  to_id: string;
  to_kind: GraphNodeKind;
  status: GraphStatus;
  confidence: GraphConfidence;
  provenance: GraphProvenance;
  review_state: GraphReviewState;
  qualifiers: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateGraphEdgeInput {
  edge_id: string;
  from_id: string;
  from_kind: GraphNodeKind;
  type: GraphEdgeType;
  to_id: string;
  to_kind: GraphNodeKind;
  status: GraphStatus;
  confidence: GraphConfidence;
  provenance: GraphProvenance;
  review_state: GraphReviewState;
  qualifiers?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function createGraphEdge(input: CreateGraphEdgeInput): GraphEdge {
  validateGraphEdgeKinds(input);

  return {
    edge_id: input.edge_id,
    from_id: input.from_id,
    from_kind: input.from_kind,
    type: input.type,
    to_id: input.to_id,
    to_kind: input.to_kind,
    status: input.status,
    confidence: input.confidence,
    provenance: input.provenance,
    review_state: input.review_state,
    qualifiers: { ...(input.qualifiers ?? {}) },
    created_at: input.created_at,
    updated_at: input.updated_at
  };
}

function validateGraphEdgeKinds(input: CreateGraphEdgeInput): void {
  if (input.type === 'supported_by' && (input.from_kind !== 'assertion' || input.to_kind !== 'evidence')) {
    throw new Error('supported_by edges must connect assertion to evidence');
  }

  if (input.type === 'derived_from' && (input.from_kind !== 'evidence' || input.to_kind !== 'source')) {
    throw new Error('derived_from edges must connect evidence to source');
  }

  if (input.type === 'belongs_to_taxonomy' && input.to_kind !== 'taxonomy') {
    throw new Error('belongs_to_taxonomy edges must target taxonomy');
  }
}
