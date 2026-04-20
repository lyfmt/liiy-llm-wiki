import type { GraphConfidence, GraphNodeKind, GraphProvenance, GraphReviewState, GraphStatus } from './graph-node.js';

export type GraphEdgeType =
  | 'about'
  | 'supported_by'
  | 'derived_from'
  | 'belongs_to_taxonomy'
  | 'part_of'
  | 'mentions';

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
  if (
    input.type === 'part_of' &&
    !(
      (input.from_kind === 'taxonomy' && input.to_kind === 'taxonomy') ||
      (input.from_kind === 'section' && ['topic', 'section'].includes(input.to_kind))
    )
  ) {
    throw new Error('part_of edges must connect taxonomy to taxonomy or section to topic/section');
  }

  if (
    input.type === 'about' &&
    (input.from_kind !== 'assertion' || !['topic', 'section', 'entity'].includes(input.to_kind))
  ) {
    throw new Error('about edges must connect assertion to topic, section, or entity');
  }

  if (input.type === 'supported_by' && (input.from_kind !== 'assertion' || input.to_kind !== 'evidence')) {
    throw new Error('supported_by edges must connect assertion to evidence');
  }

  if (input.type === 'derived_from' && (input.from_kind !== 'evidence' || input.to_kind !== 'source')) {
    throw new Error('derived_from edges must connect evidence to source');
  }

  if (
    input.type === 'mentions' &&
    (!['topic', 'section', 'source', 'evidence', 'assertion'].includes(input.from_kind) || input.to_kind !== 'entity')
  ) {
    throw new Error('mentions edges must connect topic/section/source/evidence/assertion to entity');
  }

  if (input.type === 'belongs_to_taxonomy' && input.to_kind !== 'taxonomy') {
    throw new Error('belongs_to_taxonomy edges must target taxonomy');
  }
}
