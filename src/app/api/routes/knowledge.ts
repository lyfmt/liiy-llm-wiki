import { randomUUID } from 'node:crypto';

import { buildDiscoveryResponseDto } from '../mappers/discovery.js';
import { buildKnowledgeNavigationResponseDto } from '../mappers/knowledge-navigation.js';
import { buildKnowledgePageResponseDto } from '../mappers/knowledge-page.js';
import { buildKnowledgePageUpsertResponseDto } from '../mappers/knowledge-page-command.js';
import { buildWikiIndexResponseDto } from '../mappers/wiki-index.js';
import { parseKnowledgePageUpsertRequestDto } from '../services/command.js';
import type { ApiRouteContext } from '../route-context.js';
import { decodePageLocator, readJsonBody, writeJson } from '../route-helpers.js';
import { runUpsertKnowledgePageFlow } from '../../../flows/wiki/run-upsert-knowledge-page-flow.js';

export async function handleKnowledgeRoutes(context: ApiRouteContext): Promise<boolean> {
  const { root, request, response, method, pathname } = context;

  if (method === 'GET' && pathname === '/api/discovery') {
    writeJson(response, 200, await buildDiscoveryResponseDto(root));
    return true;
  }

  if (method === 'GET' && pathname === '/api/wiki/index') {
    writeJson(response, 200, await buildWikiIndexResponseDto(root));
    return true;
  }

  if (method === 'GET' && pathname === '/api/knowledge/navigation') {
    writeJson(response, 200, await buildKnowledgeNavigationResponseDto(root));
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/pages/')) {
    const [kind, slug] = decodePageLocator(pathname.slice('/api/pages/'.length));
    writeJson(response, 200, await buildKnowledgePageResponseDto(root, kind, slug));
    return true;
  }

  if (method === 'PUT' && pathname.startsWith('/api/pages/')) {
    const [kind, slug] = decodePageLocator(pathname.slice('/api/pages/'.length));
    const payload = parseKnowledgePageUpsertRequestDto(await readJsonBody(request));
    const flowResult = await runUpsertKnowledgePageFlow(root, {
      runId: randomUUID(),
      userRequest: `upsert ${kind} ${slug}`,
      kind,
      slug,
      title: payload.title,
      aliases: payload.aliases,
      summary: payload.summary ?? '',
      tags: payload.tags ?? [],
      source_refs: payload.source_refs,
      outgoing_links: payload.outgoing_links,
      status: payload.status,
      updated_at: payload.updated_at,
      body: payload.body,
      rationale: payload.rationale || `manual web edit for ${kind} ${slug}`
    });
    writeJson(
      response,
      200,
      await buildKnowledgePageUpsertResponseDto({
        root,
        kind,
        slug,
        review: flowResult.review,
        touched_files: flowResult.persisted
      })
    );
    return true;
  }

  return false;
}
