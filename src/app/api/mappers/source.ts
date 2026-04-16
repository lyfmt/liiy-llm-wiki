import type { SourceDetailDto, SourceSummaryDto, SourceUpsertResponseDto } from '../dto/source.js';
import type { SourceManifest } from '../../../domain/source-manifest.js';

export function toSourceSummaryDto(manifest: SourceManifest): SourceSummaryDto {
  return {
    id: manifest.id,
    title: manifest.title,
    type: manifest.type,
    status: manifest.status,
    raw_path: manifest.path,
    imported_at: manifest.imported_at,
    tags: [...manifest.tags],
    has_notes: manifest.notes.trim().length > 0,
    links: buildSourceLinksDto(manifest.id)
  };
}

export function toSourceDetailDto(manifest: SourceManifest): SourceDetailDto {
  return {
    ...toSourceSummaryDto(manifest),
    hash: manifest.hash,
    notes: manifest.notes
  };
}

export function toSourceSummaryListDto(manifests: SourceManifest[]): SourceSummaryDto[] {
  return manifests.map((manifest) => toSourceSummaryDto(manifest));
}

export function buildSourceUpsertResponseDto(manifest: SourceManifest): SourceUpsertResponseDto {
  return {
    ok: true,
    source: toSourceDetailDto(manifest)
  };
}

function buildSourceLinksDto(sourceId: string): SourceSummaryDto['links'] {
  const encodedSourceId = encodeURIComponent(sourceId);

  return {
    api: `/api/sources/${encodedSourceId}`
  };
}
