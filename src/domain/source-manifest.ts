export type SourceManifestStatus = 'inbox' | 'accepted' | 'rejected' | 'processed';

export interface SourceManifest {
  id: string;
  path: string;
  title: string;
  type: string;
  status: SourceManifestStatus;
  hash: string;
  imported_at: string;
  tags: string[];
  notes: string;
}

export interface CreateSourceManifestInput {
  id: string;
  path: string;
  title: string;
  type: string;
  status?: SourceManifestStatus;
  hash: string;
  imported_at: string;
  tags?: string[];
  notes?: string;
}

export function createSourceManifest(input: CreateSourceManifestInput): SourceManifest {
  return {
    id: input.id,
    path: input.path,
    title: input.title,
    type: input.type,
    status: input.status ?? 'inbox',
    hash: input.hash,
    imported_at: input.imported_at,
    tags: [...(input.tags ?? [])],
    notes: input.notes ?? ''
  };
}
