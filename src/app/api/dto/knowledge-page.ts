import type { KnowledgePageKind } from '../../../domain/knowledge-page.js';

export interface KnowledgePageLinkDto {
  kind: KnowledgePageKind;
  slug: string;
  title: string;
  summary: string;
  path: string;
  links: {
    app: string;
    api: string;
  };
}

export interface KnowledgePageResponseDto {
  page: {
    kind: KnowledgePageKind;
    slug: string;
    path: string;
    title: string;
    summary: string;
    aliases: string[];
    tags: string[];
    status: string;
    updated_at: string;
    body: string;
  };
  navigation: {
    taxonomy: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
    sections: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
    entities: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
    assertions: Array<{
      id: string;
      title: string;
      statement: string;
      evidence_count: number;
    }>;
    source_refs: Array<{
      path: string;
      manifest_id: string | null;
      manifest_title: string | null;
      links: {
        app: string | null;
        api: string | null;
      };
    }>;
    outgoing_links: Array<{
      target: string;
      is_local_wiki_page: boolean;
      links: {
        app: string | null;
        api: string | null;
      };
    }>;
    backlinks: KnowledgePageLinkDto[];
    related_by_source: Array<KnowledgePageLinkDto & { shared_source_refs: string[] }>;
  };
}
