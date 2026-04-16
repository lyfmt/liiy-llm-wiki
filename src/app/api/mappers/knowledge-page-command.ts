import type { KnowledgePageResponseDto } from '../dto/knowledge-page.js';
import type { ReviewGateDecision } from '../../../policies/review-gate.js';
import type { KnowledgePageKind } from '../../../domain/knowledge-page.js';
import { buildKnowledgePageResponseDto } from './knowledge-page.js';

export interface KnowledgePageUpsertResponseDto {
  ok: boolean;
  status: 'done' | 'needs_review';
  review: ReviewGateDecision;
  touched_files: string[];
  page: KnowledgePageResponseDto;
}

export async function buildKnowledgePageUpsertResponseDto(input: {
  root: string;
  kind: KnowledgePageKind;
  slug: string;
  review: ReviewGateDecision;
  touched_files: string[];
}): Promise<KnowledgePageUpsertResponseDto> {
  return {
    ok: !input.review.needs_review,
    status: input.review.needs_review ? 'needs_review' : 'done',
    review: input.review,
    touched_files: [...input.touched_files],
    page: await buildKnowledgePageResponseDto(input.root, input.kind, input.slug)
  };
}
