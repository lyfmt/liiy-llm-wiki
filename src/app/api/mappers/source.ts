import type { RawSourceDetailDto, SourceDetailDto, SourceSummaryDto, SourceUpsertResponseDto } from '../dto/source.js';
import type { SourceManifest } from '../../../domain/source-manifest.js';
import { readRawDocument } from '../../../flows/ingest/read-raw-document.js';

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

export async function toRawSourceDetailDto(root: string, manifest: SourceManifest): Promise<RawSourceDetailDto> {
  const body = await readRawDocument(root, manifest.path);

  return {
    ...toSourceDetailDto(manifest),
    body,
    line_count: countLines(body)
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

function countLines(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const normalized = value.replace(/\r\n/gu, '\n');
  const lines = normalized.split('\n');

  return normalized.endsWith('\n') ? lines.length - 1 : lines.length;
}
