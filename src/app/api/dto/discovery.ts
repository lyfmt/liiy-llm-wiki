import type { KnowledgePageKind } from '../../../domain/knowledge-page.js';

export interface DiscoveryItemDto {
  kind: KnowledgePageKind;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  updated_at: string;
  path: string;
  source_ref_count: number;
  links: {
    app: string;
    api: string;
  };
}

export interface DiscoverySectionDto {
  kind: KnowledgePageKind;
  title: string;
  description: string;
  count: number;
  items: DiscoveryItemDto[];
}

export interface DiscoveryResponseDto {
  index_markdown: string;
  totals: {
    sources: number;
    entities: number;
    taxonomy: number;
    topics: number;
    queries: number;
  };
  sections: DiscoverySectionDto[];
}
