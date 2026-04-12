export type KnowledgePageKind = 'source' | 'entity' | 'topic' | 'query';

export interface KnowledgePage {
  path: string;
  kind: KnowledgePageKind;
  title: string;
  aliases: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  updated_at: string;
}

export interface CreateKnowledgePageInput {
  path: string;
  kind: KnowledgePageKind;
  title: string;
  aliases?: string[];
  source_refs: string[];
  outgoing_links?: string[];
  status: string;
  updated_at: string;
}

export function createKnowledgePage(input: CreateKnowledgePageInput): KnowledgePage {
  return {
    path: input.path,
    kind: input.kind,
    title: input.title,
    aliases: [...(input.aliases ?? [])],
    source_refs: [...input.source_refs],
    outgoing_links: [...(input.outgoing_links ?? [])],
    status: input.status,
    updated_at: input.updated_at
  };
}
