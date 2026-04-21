import { describe, expect, it } from 'vitest';

import {
  buildIntentPlan,
  classifyIntent,
  createRuntimeContext,
  createRuntimeRunState,
  discoverRuntimeSkills,
  formatSkillsForPrompt,
  createDraftKnowledgePageTool,
  createDraftQueryPageTool,
  createApplyDraftUpsertTool,
  createCreateSourceFromAttachmentTool,
  createFindSourceManifestTool,
  createIngestSourceTool,
  createListWikiPagesTool,
  createReadArtifactTool,
  createReadSkillTool,
  createRunSkillTool,
  createRunSubagentTool,
  discoverRuntimeSubagents,
  createReadWikiPageTool,
  createListSourceManifestsTool,
  createReadSourceManifestTool,
  createReadRawSourceTool,
  createUpsertKnowledgePageTool,
  createLintWikiTool,
  createQueryWikiTool,
  createWriteArtifactTool,
  runRuntimeAgent,
  resolveRuntimeModel,
  runUpsertKnowledgePageFlow
} from '../../src/index.js';
import type {
  CreateRuntimeContextInput,
  CreateRuntimeRunStateInput,
  SkillFrontmatter,
  SkillSummary,
  LoadedSkillDocument,
  RuntimeSkillDiagnostic,
  DiscoverRuntimeSubagentsResult,
  DraftKnowledgePageParameters,
  DraftQueryPageParameters,
  ApplyDraftUpsertParameters,
  CreateSourceFromAttachmentParameters,
  FindSourceManifestParameters,
  IngestSourceParameters,
  ListWikiPagesParameters,
  ReadArtifactParameters,
  ReadWikiPageParameters,
  RunSubagentInput,
  RunSubagentParameters,
  RunSkillParameters,
  ListSourceManifestsParameters,
  ReadSourceManifestParameters,
  ReadRawSourceParameters,
  SubagentProfile,
  SubagentReceipt,
  UpsertKnowledgePageParameters,
  LintWikiParameters,
  QueryWikiParameters,
  RunRuntimeAgentInput,
  RuntimeIntent,
  RuntimeToolOutcome,
  ResolveRuntimeModelResult,
  WriteArtifactParameters
} from '../../src/index.js';

describe('package entry runtime exports', () => {
  it('re-exports the runtime APIs and public types', () => {
    expect(typeof classifyIntent).toBe('function');
    expect(typeof buildIntentPlan).toBe('function');
    expect(typeof createRuntimeContext).toBe('function');
    expect(typeof createRuntimeRunState).toBe('function');
    expect(typeof discoverRuntimeSkills).toBe('function');
    expect(typeof formatSkillsForPrompt).toBe('function');
    expect(typeof createDraftKnowledgePageTool).toBe('function');
    expect(typeof createDraftQueryPageTool).toBe('function');
    expect(typeof createApplyDraftUpsertTool).toBe('function');
    expect(typeof createCreateSourceFromAttachmentTool).toBe('function');
    expect(typeof createFindSourceManifestTool).toBe('function');
    expect(typeof createIngestSourceTool).toBe('function');
    expect(typeof createListWikiPagesTool).toBe('function');
    expect(typeof createReadArtifactTool).toBe('function');
    expect(typeof createReadSkillTool).toBe('function');
    expect(typeof createRunSkillTool).toBe('function');
    expect(typeof createRunSubagentTool).toBe('function');
    expect(typeof discoverRuntimeSubagents).toBe('function');
    expect(typeof createReadWikiPageTool).toBe('function');
    expect(typeof createListSourceManifestsTool).toBe('function');
    expect(typeof createReadSourceManifestTool).toBe('function');
    expect(typeof createReadRawSourceTool).toBe('function');
    expect(typeof createUpsertKnowledgePageTool).toBe('function');
    expect(typeof createQueryWikiTool).toBe('function');
    expect(typeof createWriteArtifactTool).toBe('function');
    expect(typeof createLintWikiTool).toBe('function');
    expect(typeof runRuntimeAgent).toBe('function');
    expect(typeof resolveRuntimeModel).toBe('function');
    expect(typeof runUpsertKnowledgePageFlow).toBe('function');

    const intent: RuntimeIntent = 'query';
    const contextInput: CreateRuntimeContextInput | null = null;
    const stateInput: CreateRuntimeRunStateInput | null = null;
    const skillFrontmatter: SkillFrontmatter | null = null;
    const skillSummary: SkillSummary | null = null;
    const loadedSkillDocument: LoadedSkillDocument | null = null;
    const skillDiagnostic: RuntimeSkillDiagnostic | null = null;
    const discoveredSubagents: DiscoverRuntimeSubagentsResult | null = null;
    const subagentProfile: SubagentProfile | null = null;
    const subagentReceipt: SubagentReceipt | null = null;
    const toolOutcome: RuntimeToolOutcome | null = null;
    const agentInput: RunRuntimeAgentInput | null = null;
    const draftParams: DraftKnowledgePageParameters | null = null;
    const draftQueryParams: DraftQueryPageParameters | null = null;
    const applyDraftParams: ApplyDraftUpsertParameters | null = null;
    const createSourceParams: CreateSourceFromAttachmentParameters | null = null;
    const findParams: FindSourceManifestParameters | null = null;
    const ingestParams: IngestSourceParameters | null = null;
    const listWikiPagesParams: ListWikiPagesParameters | null = null;
    const readArtifactParams: ReadArtifactParameters | null = null;
    const runSubagentInput: RunSubagentInput | null = null;
    const runSubagentParams: RunSubagentParameters | null = null;
    const runSkillParams: RunSkillParameters | null = null;
    const readWikiPageParams: ReadWikiPageParameters | null = null;
    const listSourceManifestsParams: ListSourceManifestsParameters | null = null;
    const readSourceManifestParams: ReadSourceManifestParameters | null = null;
    const readRawSourceParams: ReadRawSourceParameters | null = null;
    const upsertKnowledgePageParams: UpsertKnowledgePageParameters | null = null;
    const queryParams: QueryWikiParameters | null = null;
    const writeArtifactParams: WriteArtifactParameters | null = null;
    const lintParams: LintWikiParameters | null = null;
    const resolvedModel: ResolveRuntimeModelResult | null = null;

    expect(intent).toBe('query');
    expect(contextInput).toBeNull();
    expect(stateInput).toBeNull();
    expect(skillFrontmatter).toBeNull();
    expect(skillSummary).toBeNull();
    expect(loadedSkillDocument).toBeNull();
    expect(skillDiagnostic).toBeNull();
    expect(discoveredSubagents).toBeNull();
    expect(subagentProfile).toBeNull();
    expect(subagentReceipt).toBeNull();
    expect(toolOutcome).toBeNull();
    expect(agentInput).toBeNull();
    expect(draftParams).toBeNull();
    expect(draftQueryParams).toBeNull();
    expect(applyDraftParams).toBeNull();
    expect(createSourceParams).toBeNull();
    expect(findParams).toBeNull();
    expect(ingestParams).toBeNull();
    expect(listWikiPagesParams).toBeNull();
    expect(readArtifactParams).toBeNull();
    expect(runSubagentInput).toBeNull();
    expect(runSubagentParams).toBeNull();
    expect(runSkillParams).toBeNull();
    expect(readWikiPageParams).toBeNull();
    expect(listSourceManifestsParams).toBeNull();
    expect(readSourceManifestParams).toBeNull();
    expect(readRawSourceParams).toBeNull();
    expect(upsertKnowledgePageParams).toBeNull();
    expect(queryParams).toBeNull();
    expect(writeArtifactParams).toBeNull();
    expect(lintParams).toBeNull();
    expect(resolvedModel).toBeNull();
  });
});
