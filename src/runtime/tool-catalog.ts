import type { AgentState } from '@mariozechner/pi-agent-core';

import type { RuntimeContext } from './runtime-context.js';
import { createApplyDraftUpsertTool } from './tools/apply-draft-upsert.js';
import { createCreateSourceFromAttachmentTool } from './tools/create-source-from-attachment.js';
import {
  createDraftKnowledgePageTool,
  type KnowledgePageDraftSynthesizer
} from './tools/draft-knowledge-page.js';
import { createDraftQueryPageTool } from './tools/draft-query-page.js';
import { createFindSourceManifestTool } from './tools/find-source-manifest.js';
import { createIngestSourceTool } from './tools/ingest-source.js';
import { createLintWikiTool } from './tools/lint-wiki.js';
import { createListSourceManifestsTool } from './tools/list-source-manifests.js';
import { createListWikiPagesTool } from './tools/list-wiki-pages.js';
import { type QueryAnswerSynthesizer } from '../flows/query/run-query-flow.js';
import { createQueryWikiTool } from './tools/query-wiki.js';
import { createReadRawSourceTool } from './tools/read-raw-source.js';
import { createReadSourceManifestTool } from './tools/read-source-manifest.js';
import { createReadWikiPageTool } from './tools/read-wiki-page.js';
import { createUpsertKnowledgePageTool } from './tools/upsert-knowledge-page.js';

export interface RuntimeToolCatalogOptions {
  querySynthesizer?: QueryAnswerSynthesizer;
  knowledgeDraftSynthesizer?: KnowledgePageDraftSynthesizer;
}

export type RuntimeToolCatalog = Record<string, AgentState['tools'][number]>;

export function buildRuntimeToolCatalog(
  runtimeContext: RuntimeContext,
  options: RuntimeToolCatalogOptions = {}
): RuntimeToolCatalog {
  return {
    list_wiki_pages: createListWikiPagesTool(runtimeContext),
    read_wiki_page: createReadWikiPageTool(runtimeContext),
    list_source_manifests: createListSourceManifestsTool(runtimeContext),
    read_source_manifest: createReadSourceManifestTool(runtimeContext),
    read_raw_source: createReadRawSourceTool(runtimeContext),
    create_source_from_attachment: createCreateSourceFromAttachmentTool(runtimeContext),
    draft_knowledge_page: createDraftKnowledgePageTool(runtimeContext, {
      synthesizeDraft: options.knowledgeDraftSynthesizer
    }),
    draft_query_page: createDraftQueryPageTool(runtimeContext, {
      synthesizeAnswer: options.querySynthesizer
    }),
    apply_draft_upsert: createApplyDraftUpsertTool(runtimeContext),
    find_source_manifest: createFindSourceManifestTool(runtimeContext),
    ingest_source: createIngestSourceTool(runtimeContext),
    query_wiki: createQueryWikiTool(runtimeContext, {
      synthesizeAnswer: options.querySynthesizer
    }),
    upsert_knowledge_page: createUpsertKnowledgePageTool(runtimeContext),
    lint_wiki: createLintWikiTool(runtimeContext)
  };
}
