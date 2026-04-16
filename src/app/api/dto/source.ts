import type { SourceManifestStatus } from '../../../domain/source-manifest.js';

export interface SourceLinksDto {
  api: string;
}

export interface SourceSummaryDto {
  id: string;
  title: string;
  type: string;
  status: SourceManifestStatus;
  raw_path: string;
  imported_at: string;
  tags: string[];
  has_notes: boolean;
  links: SourceLinksDto;
}

export interface SourceDetailDto extends SourceSummaryDto {
  hash: string;
  notes: string;
}

export interface SourceUpsertResponseDto {
  ok: boolean;
  source: SourceDetailDto;
}
