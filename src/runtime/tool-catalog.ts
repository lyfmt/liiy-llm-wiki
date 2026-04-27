import type { AgentState } from '@mariozechner/pi-agent-core';

import type { RuntimeContext } from './runtime-context.js';
import { createApplyDraftUpsertTool } from './tools/apply-draft-upsert.js';
import { createAuditTaxonomyHostingTool } from './tools/audit-taxonomy-hosting.js';
import { createAuditTopicHostingTool } from './tools/audit-topic-hosting.js';
import { createAuditExtractionCoverageTool } from './tools/audit-extraction-coverage.js';
import { createBuildTaxonomyCatalogTool } from './tools/build-taxonomy-catalog.js';
import { createBuildTopicCatalogTool } from './tools/build-topic-catalog.js';
import { createBuildTopicInsertionPlanTool } from './tools/build-topic-insertion-plan.js';
import { createCreateSourceFromAttachmentTool } from './tools/create-source-from-attachment.js';
import { createDraftTopicPagesFromPlanTool } from './tools/draft-topic-pages-from-plan.js';
import {
  createDraftKnowledgePageTool,
  type KnowledgePageDraftSynthesizer
} from './tools/draft-knowledge-page.js';
import { createDraftQueryPageTool } from './tools/draft-query-page.js';
import { createFindSourceManifestTool } from './tools/find-source-manifest.js';
import { createIngestSourceTool } from './tools/ingest-source.js';
import { createIngestSourceToGraphTool } from './tools/ingest-source-to-graph.js';
import { createLintWikiTool } from './tools/lint-wiki.js';
import { createListSourceManifestsTool } from './tools/list-source-manifests.js';
import { createListWikiPagesTool } from './tools/list-wiki-pages.js';
import { type QueryAnswerSynthesizer } from '../flows/query/run-query-flow.js';
import { createMergeExtractedKnowledgeTool } from './tools/merge-extracted-knowledge.js';
import { createMergeSectionCandidatesTool } from './tools/merge-section-candidates.js';
import { createQueryWikiTool } from './tools/query-wiki.js';
import { createReadArtifactTool } from './tools/read-artifact.js';
import { createReadRawSourceTool } from './tools/read-raw-source.js';
import { createReadSourceManifestTool } from './tools/read-source-manifest.js';
import { createReadWikiPageTool } from './tools/read-wiki-page.js';
import { createAssignSectionsToTopicsTool } from './tools/assign-sections-to-topics.js';
import { createPrepareSourceResourceTool } from './tools/prepare-source-resource.js';
import { createResolveSourceTopicsTool } from './tools/resolve-source-topics.js';
import { createResolveTopicTaxonomyTool } from './tools/resolve-topic-taxonomy.js';
import { createResolveTopicHostsTool } from './tools/resolve-topic-hosts.js';
import { createSplitBlockBatchesTool } from './tools/split-block-batches.js';
import { createSplitResourceBlocksTool } from './tools/split-resource-blocks.js';
import {
  createStartKnowledgeInsertPipelineTool,
  type CreateStartKnowledgeInsertPipelineToolOptions
} from './tools/start-knowledge-insert-pipeline.js';
import { createUpsertKnowledgeInsertGraphTool } from './tools/upsert-knowledge-insert-graph.js';
import { createUpsertKnowledgePageTool } from './tools/upsert-knowledge-page.js';
import { createWriteArtifactTool } from './tools/write-artifact.js';

export interface RuntimeToolCatalogOptions {
  querySynthesizer?: QueryAnswerSynthesizer;
  knowledgeDraftSynthesizer?: KnowledgePageDraftSynthesizer;
  knowledgeInsertPipelineLauncher?: CreateStartKnowledgeInsertPipelineToolOptions;
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
    prepare_source_resource: createPrepareSourceResourceTool(runtimeContext),
    split_resource_blocks: createSplitResourceBlocksTool(runtimeContext),
    split_block_batches: createSplitBlockBatchesTool(runtimeContext),
    merge_extracted_knowledge: createMergeExtractedKnowledgeTool(runtimeContext),
    merge_section_candidates: createMergeSectionCandidatesTool(runtimeContext),
    build_topic_catalog: createBuildTopicCatalogTool(runtimeContext),
    build_taxonomy_catalog: createBuildTaxonomyCatalogTool(runtimeContext),
    resolve_source_topics: createResolveSourceTopicsTool(runtimeContext),
    assign_sections_to_topics: createAssignSectionsToTopicsTool(runtimeContext),
    resolve_topic_taxonomy: createResolveTopicTaxonomyTool(runtimeContext),
    resolve_topic_hosts: createResolveTopicHostsTool(runtimeContext),
    audit_topic_hosting: createAuditTopicHostingTool(runtimeContext),
    audit_taxonomy_hosting: createAuditTaxonomyHostingTool(runtimeContext),
    build_topic_insertion_plan: createBuildTopicInsertionPlanTool(runtimeContext),
    audit_extraction_coverage: createAuditExtractionCoverageTool(runtimeContext),
    read_artifact: createReadArtifactTool(runtimeContext),
    write_artifact: createWriteArtifactTool(runtimeContext),
    create_source_from_attachment: createCreateSourceFromAttachmentTool(runtimeContext),
    start_knowledge_insert_pipeline: createStartKnowledgeInsertPipelineTool(runtimeContext, options.knowledgeInsertPipelineLauncher),
    draft_knowledge_page: createDraftKnowledgePageTool(runtimeContext, {
      synthesizeDraft: options.knowledgeDraftSynthesizer
    }),
    draft_topic_pages_from_plan: createDraftTopicPagesFromPlanTool(runtimeContext),
    draft_query_page: createDraftQueryPageTool(runtimeContext, {
      synthesizeAnswer: options.querySynthesizer
    }),
    apply_draft_upsert: createApplyDraftUpsertTool(runtimeContext),
    find_source_manifest: createFindSourceManifestTool(runtimeContext),
    ingest_source: createIngestSourceTool(runtimeContext),
    ingest_source_to_graph: createIngestSourceToGraphTool(runtimeContext),
    query_wiki: createQueryWikiTool(runtimeContext, {
      synthesizeAnswer: options.querySynthesizer
    }),
    upsert_knowledge_insert_graph: createUpsertKnowledgeInsertGraphTool(runtimeContext),
    upsert_knowledge_page: createUpsertKnowledgePageTool(runtimeContext),
    lint_wiki: createLintWikiTool(runtimeContext)
  };
}
