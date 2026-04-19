export type GraphNodeKind =
  | 'taxonomy'
  | 'topic'
  | 'section'
  | 'entity'
  | 'source'
  | 'evidence'
  | 'assertion';

export type GraphStatus = 'draft' | 'active' | 'stale' | 'disputed' | 'archived';
export type GraphConfidence = 'asserted' | 'inferred' | 'weak' | 'conflicted';
export type GraphReviewState = 'unreviewed' | 'reviewed' | 'rejected';
export type GraphProvenance = 'source-derived' | 'agent-extracted' | 'agent-synthesized' | 'human-edited';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  title: string;
  summary: string;
  aliases: string[];
  status: GraphStatus;
  confidence: GraphConfidence;
  provenance: GraphProvenance;
  review_state: GraphReviewState;
  retrieval_text: string;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateGraphNodeInput {
  id: string;
  kind: GraphNodeKind;
  title: string;
  summary?: string;
  aliases?: string[];
  status: GraphStatus;
  confidence: GraphConfidence;
  provenance: GraphProvenance;
  review_state: GraphReviewState;
  retrieval_text?: string;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function createGraphNode(input: CreateGraphNodeInput): GraphNode {
  const aliases = normalizeAliases(input.aliases ?? []);
  const summary = input.summary?.trim() ?? '';
  const retrievalText = input.retrieval_text?.trim() ?? '';
  const attributes = { ...input.attributes };

  if (input.kind === 'evidence') {
    const locator = typeof attributes.locator === 'string' ? attributes.locator.trim() : '';
    const excerpt = typeof attributes.excerpt === 'string' ? attributes.excerpt.trim() : '';

    if (locator === '' || excerpt === '') {
      throw new Error('Evidence nodes require locator and excerpt');
    }
  }

  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    summary,
    aliases,
    status: input.status,
    confidence: input.confidence,
    provenance: input.provenance,
    review_state: input.review_state,
    retrieval_text: retrievalText,
    attributes,
    created_at: input.created_at,
    updated_at: input.updated_at
  };
}

function normalizeAliases(aliases: string[]): string[] {
  return [...new Set(aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0))];
}
