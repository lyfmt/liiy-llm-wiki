export type KnowledgeNavigationNodeKind =
  | 'taxonomy'
  | 'topic'
  | 'section_group'
  | 'entity_group'
  | 'concept_group'
  | 'section'
  | 'entity'
  | 'concept';

export type KnowledgeGraphRelatedTargetKind = 'topic' | 'section' | 'entity' | 'concept' | 'evidence';

export interface KnowledgeNavigationNodeDto {
  id: string;
  kind: KnowledgeNavigationNodeKind;
  title: string;
  summary: string;
  count: number;
  href: string | null;
  related: KnowledgeGraphRelatedLinkDto[];
  children: KnowledgeNavigationNodeDto[];
}

export interface KnowledgeGraphRelatedLinkDto {
  edge_id: string;
  type: 'about' | 'grounded_by' | 'mentions' | 'part_of';
  direction: 'outgoing' | 'incoming';
  target: {
    id: string;
    kind: KnowledgeGraphRelatedTargetKind;
    title: string;
    summary: string;
    href: string | null;
  };
}

export interface KnowledgeNavigationResponseDto {
  roots: KnowledgeNavigationNodeDto[];
}
