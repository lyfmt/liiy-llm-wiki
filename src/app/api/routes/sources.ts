import { toSourceDetailDto, toSourceSummaryListDto, buildSourceUpsertResponseDto } from '../mappers/source.js';
import { parseSourceManifestUpsertRequestDto } from '../services/command.js';
import type { ApiRouteContext } from '../route-context.js';
import { readJsonBody, writeJson } from '../route-helpers.js';
import { createSourceManifest } from '../../../domain/source-manifest.js';
import { listSourceManifests, loadSourceManifest, saveSourceManifest } from '../../../storage/source-manifest-store.js';

export async function handleSourceRoutes(context: ApiRouteContext): Promise<boolean> {
  const { root, request, response, method, pathname } = context;

  if (method === 'GET' && pathname === '/api/sources') {
    const sources = await listSourceManifests(root);

    writeJson(response, 200, toSourceSummaryListDto(sources));
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/sources/')) {
    const sourceId = decodeURIComponent(pathname.slice('/api/sources/'.length));
    const source = await loadSourceManifest(root, sourceId);

    writeJson(response, 200, toSourceDetailDto(source));
    return true;
  }

  if (method === 'PUT' && pathname.startsWith('/api/sources/')) {
    const sourceId = decodeURIComponent(pathname.slice('/api/sources/'.length));
    const payload = parseSourceManifestUpsertRequestDto(await readJsonBody(request));
    const manifest = createSourceManifest({
      id: sourceId,
      path: payload.path,
      title: payload.title,
      type: payload.type,
      status: payload.status,
      hash: payload.hash,
      imported_at: payload.imported_at,
      tags: payload.tags,
      notes: payload.notes
    });
    await saveSourceManifest(root, manifest);
    writeJson(response, 200, buildSourceUpsertResponseDto(manifest));
    return true;
  }

  return false;
}
