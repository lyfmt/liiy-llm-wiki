import { describe, expect, it } from 'vitest';

import {
  buildIntentPlan,
  classifyIntent,
  createRuntimeContext,
  createRuntimeRunState,
  createDraftKnowledgePageTool,
  createDraftQueryPageTool,
  createApplyDraftUpsertTool,
  createFindSourceManifestTool,
  createIngestSourceTool,
  createListWikiPagesTool,
  createReadWikiPageTool,
  createListSourceManifestsTool,
  createReadSourceManifestTool,
  createReadRawSourceTool,
  createUpsertKnowledgePageTool,
  createLintWikiTool,
  createQueryWikiTool,
  runRuntimeAgent,
  resolveRuntimeModel,
  runUpsertKnowledgePageFlow
} from '../../src/index.js';
import type {
  CreateRuntimeContextInput,
  CreateRuntimeRunStateInput,
  DraftKnowledgePageParameters,
  DraftQueryPageParameters,
  ApplyDraftUpsertParameters,
  FindSourceManifestParameters,
  IngestSourceParameters,
  ListWikiPagesParameters,
  ReadWikiPageParameters,
  ListSourceManifestsParameters,
  ReadSourceManifestParameters,
  ReadRawSourceParameters,
  UpsertKnowledgePageParameters,
  LintWikiParameters,
  QueryWikiParameters,
  RunRuntimeAgentInput,
  RuntimeIntent,
  RuntimeToolOutcome,
  ResolveRuntimeModelResult
} from '../../src/index.js';

describe('package entry runtime exports', () => {
  it('re-exports the runtime APIs and public types', () => {
    expect(typeof classifyIntent).toBe('function');
    expect(typeof buildIntentPlan).toBe('function');
    expect(typeof createRuntimeContext).toBe('function');
    expect(typeof createRuntimeRunState).toBe('function');
    expect(typeof createDraftKnowledgePageTool).toBe('function');
    expect(typeof createDraftQueryPageTool).toBe('function');
    expect(typeof createApplyDraftUpsertTool).toBe('function');
    expect(typeof createFindSourceManifestTool).toBe('function');
    expect(typeof createIngestSourceTool).toBe('function');
    expect(typeof createListWikiPagesTool).toBe('function');
    expect(typeof createReadWikiPageTool).toBe('function');
    expect(typeof createListSourceManifestsTool).toBe('function');
    expect(typeof createReadSourceManifestTool).toBe('function');
    expect(typeof createReadRawSourceTool).toBe('function');
    expect(typeof createUpsertKnowledgePageTool).toBe('function');
    expect(typeof createQueryWikiTool).toBe('function');
    expect(typeof createLintWikiTool).toBe('function');
    expect(typeof runRuntimeAgent).toBe('function');
    expect(typeof resolveRuntimeModel).toBe('function');
    expect(typeof runUpsertKnowledgePageFlow).toBe('function');

    const intent: RuntimeIntent = 'query';
    const contextInput: CreateRuntimeContextInput | null = null;
    const stateInput: CreateRuntimeRunStateInput | null = null;
    const toolOutcome: RuntimeToolOutcome | null = null;
    const agentInput: RunRuntimeAgentInput | null = null;
    const draftParams: DraftKnowledgePageParameters | null = null;
    const draftQueryParams: DraftQueryPageParameters | null = null;
    const applyDraftParams: ApplyDraftUpsertParameters | null = null;
    const findParams: FindSourceManifestParameters | null = null;
    const ingestParams: IngestSourceParameters | null = null;
    const listWikiPagesParams: ListWikiPagesParameters | null = null;
    const readWikiPageParams: ReadWikiPageParameters | null = null;
    const listSourceManifestsParams: ListSourceManifestsParameters | null = null;
    const readSourceManifestParams: ReadSourceManifestParameters | null = null;
    const readRawSourceParams: ReadRawSourceParameters | null = null;
    const upsertKnowledgePageParams: UpsertKnowledgePageParameters | null = null;
    const queryParams: QueryWikiParameters | null = null;
    const lintParams: LintWikiParameters | null = null;
    const resolvedModel: ResolveRuntimeModelResult | null = null;

    expect(intent).toBe('query');
    expect(contextInput).toBeNull();
    expect(stateInput).toBeNull();
    expect(toolOutcome).toBeNull();
    expect(agentInput).toBeNull();
    expect(draftParams).toBeNull();
    expect(draftQueryParams).toBeNull();
    expect(applyDraftParams).toBeNull();
    expect(findParams).toBeNull();
    expect(ingestParams).toBeNull();
    expect(listWikiPagesParams).toBeNull();
    expect(readWikiPageParams).toBeNull();
    expect(listSourceManifestsParams).toBeNull();
    expect(readSourceManifestParams).toBeNull();
    expect(readRawSourceParams).toBeNull();
    expect(upsertKnowledgePageParams).toBeNull();
    expect(queryParams).toBeNull();
    expect(lintParams).toBeNull();
    expect(resolvedModel).toBeNull();
  });
});
