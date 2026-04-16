import { Agent, type AgentToolResult, type StreamFn } from '@mariozechner/pi-agent-core';
import { type Api, type Message, type Model } from '@mariozechner/pi-ai';

import { loadChatSettings } from '../storage/chat-settings-store.js';
import { saveRequestRunState, type RequestRunEvent } from '../storage/request-run-state-store.js';
import { syncReviewTask } from '../flows/review/sync-review-task.js';
import { buildIntentPlan, classifyIntent, type RuntimeIntent } from './intent-classifier.js';
import { resolveRuntimeModel } from './resolve-runtime-model.js';
import { createRuntimeContext } from './runtime-context.js';
import { createRuntimeRunState, type RuntimeToolOutcome } from './request-run-state.js';
import { buildRuntimeSystemPrompt } from './system-prompt.js';
import { createApplyDraftUpsertTool } from './tools/apply-draft-upsert.js';
import {
  createDraftKnowledgePageTool,
  createModelBackedKnowledgePageDraftSynthesizer
} from './tools/draft-knowledge-page.js';
import { createDraftQueryPageTool } from './tools/draft-query-page.js';
import { createFindSourceManifestTool } from './tools/find-source-manifest.js';
import { createIngestSourceTool } from './tools/ingest-source.js';
import { createLintWikiTool } from './tools/lint-wiki.js';
import { createListSourceManifestsTool } from './tools/list-source-manifests.js';
import { createListWikiPagesTool } from './tools/list-wiki-pages.js';
import { createModelBackedQueryAnswerSynthesizer, createQueryWikiTool } from './tools/query-wiki.js';
import { createReadRawSourceTool } from './tools/read-raw-source.js';
import { createReadSourceManifestTool } from './tools/read-source-manifest.js';
import { createReadWikiPageTool } from './tools/read-wiki-page.js';
import { createUpsertKnowledgePageTool } from './tools/upsert-knowledge-page.js';

export interface RunRuntimeAgentInput {
  root: string;
  userRequest: string;
  runId: string;
  model?: Model<Api>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  streamFn?: StreamFn;
  allowQueryWriteback?: boolean;
  allowLintAutoFix?: boolean;
}

export interface RunRuntimeAgentResult {
  runId: string;
  intent: RuntimeIntent;
  plan: string[];
  assistantText: string;
  toolOutcomes: RuntimeToolOutcome[];
  savedRunState: string;
}

type RuntimeAgentMessage = Message;

function convertToLlm(messages: RuntimeAgentMessage[]): Message[] {
  return messages.filter(
    (message): message is Message =>
      message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'
  );
}

export async function runRuntimeAgent(input: RunRuntimeAgentInput): Promise<RunRuntimeAgentResult> {
  const intent = classifyIntent(input.userRequest);
  const plan = buildIntentPlan(intent);
  const resolvedRuntimeModel = input.model
    ? {
        model: input.model,
        getApiKey: input.getApiKey ?? (() => undefined)
      }
    : resolveRuntimeModel(await loadChatSettings(input.root), { root: input.root });
  const runtimeContext = createRuntimeContext({
    root: input.root,
    runId: input.runId,
    allowQueryWriteback: input.allowQueryWriteback,
    allowLintAutoFix: input.allowLintAutoFix
  });
  const toolOutcomes: RuntimeToolOutcome[] = [];
  const events: RequestRunEvent[] = [];
  const querySynthesizer =
    input.streamFn === undefined
      ? createModelBackedQueryAnswerSynthesizer({
          model: resolvedRuntimeModel.model,
          getApiKey: resolvedRuntimeModel.getApiKey,
          sessionId: input.runId
        })
      : undefined;
  const knowledgeDraftSynthesizer =
    input.streamFn === undefined
      ? createModelBackedKnowledgePageDraftSynthesizer({
          model: resolvedRuntimeModel.model,
          getApiKey: resolvedRuntimeModel.getApiKey,
          sessionId: input.runId
        })
      : undefined;
  const tools = buildToolsForIntent(intent, runtimeContext, querySynthesizer, knowledgeDraftSynthesizer);
  const persistRuntimeSnapshot = async (overrides?: {
    status?: 'running' | 'needs_review' | 'done' | 'failed';
    assistantSummary?: string;
  }) => {
    const runtimeState = createRuntimeRunState({
      runId: input.runId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: overrides?.assistantSummary ?? collectAssistantText(agent.state.messages as RuntimeAgentMessage[], toolOutcomes),
      status: overrides?.status,
      events
    });

    await saveRequestRunState(input.root, runtimeState);
    return runtimeState;
  };
  const appendEvent = async (event: RequestRunEvent, snapshot?: { status?: 'running' | 'needs_review' | 'done' | 'failed'; assistantSummary?: string }) => {
    events.push(event);
    await persistRuntimeSnapshot(snapshot);
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: buildRuntimeSystemPrompt(intent),
      model: resolvedRuntimeModel.model,
      tools,
      messages: []
    },
    streamFn: input.streamFn,
    getApiKey: resolvedRuntimeModel.getApiKey,
    convertToLlm,
    beforeToolCall: async ({ toolCall }) => {
      await appendEvent(
        {
          type: 'tool_started',
          timestamp: new Date().toISOString(),
          summary: `Starting ${toolCall.name}`,
          status: 'running',
          tool_name: toolCall.name,
          tool_call_id: toolCall.id,
          data: isRecord(toolCall.arguments) ? toolCall.arguments : undefined
        },
        { status: 'running', assistantSummary: `Running ${toolCall.name}…` }
      );

      return undefined;
    },
    afterToolCall: async ({ toolCall, result }) => {
      const details = result.details as RuntimeToolOutcome;
      toolOutcomes.push(details);
      const eventTimestamp = new Date().toISOString();
      const evidence = details.evidence ?? [];
      const touchedFiles = details.touchedFiles ?? [];

      await appendEvent(
        {
          type: 'tool_finished',
          timestamp: eventTimestamp,
          summary: `${details.toolName}: ${details.summary}`,
          status: 'running',
          tool_name: details.toolName,
          tool_call_id: toolCall.id,
          evidence,
          touched_files: touchedFiles,
          data: details.data
        },
        { status: 'running', assistantSummary: `${details.toolName}: ${details.summary}` }
      );

      if (evidence.length > 0) {
        await appendEvent(
          {
            type: 'evidence_added',
            timestamp: eventTimestamp,
            summary: `${details.toolName} added ${evidence.length} evidence reference${evidence.length === 1 ? '' : 's'}`,
            status: 'running',
            tool_name: details.toolName,
            tool_call_id: toolCall.id,
            evidence
          },
          { status: 'running', assistantSummary: `${details.toolName}: ${details.summary}` }
        );
      }

      if (typeof details.resultMarkdown === 'string' && details.resultMarkdown.length > 0) {
        await appendEvent(
          {
            type: 'draft_updated',
            timestamp: eventTimestamp,
            summary: `${details.toolName} produced operator-visible output`,
            status: 'running',
            tool_name: details.toolName,
            tool_call_id: toolCall.id,
            touched_files: touchedFiles
          },
          { status: 'running', assistantSummary: `${details.toolName}: ${details.summary}` }
        );
      }

      return undefined;
    }
  });

  try {
    await appendEvent(
      {
        type: 'run_started',
        timestamp: new Date().toISOString(),
        summary: `Run started for ${intent} request`,
        status: 'running'
      },
      { status: 'running', assistantSummary: 'Run started.' }
    );
    await appendEvent(
      {
        type: 'plan_available',
        timestamp: new Date().toISOString(),
        summary: `Plan ready with ${plan.length} step${plan.length === 1 ? '' : 's'}`,
        status: 'running',
        data: { plan }
      },
      { status: 'running', assistantSummary: `Planning ${intent} run.` }
    );

    await agent.prompt(createInitialPrompt(input.userRequest, intent));

    const finalAssistant = getLatestAssistantMessage(agent.state.messages as RuntimeAgentMessage[]);

    if (finalAssistant?.stopReason === 'error' || finalAssistant?.stopReason === 'aborted') {
      throw new Error(finalAssistant.errorMessage ?? `Runtime agent ended with ${finalAssistant.stopReason}`);
    }

    const assistantText = collectAssistantText(agent.state.messages as RuntimeAgentMessage[], toolOutcomes);
    await appendEvent(
      {
        type: 'run_completed',
        timestamp: new Date().toISOString(),
        summary: assistantText || 'Runtime completed without assistant text.',
        status: toolOutcomes.some((outcome) => outcome.needsReview) ? 'needs_review' : 'done',
        touched_files: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? [])),
        evidence: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.evidence ?? []))
      },
      {
        status: toolOutcomes.some((outcome) => outcome.needsReview) ? 'needs_review' : 'done',
        assistantSummary: assistantText || 'Runtime completed without assistant text.'
      }
    );
    const runtimeState = createRuntimeRunState({
      runId: input.runId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: assistantText || 'Runtime completed without assistant text.',
      events
    });
    const savedPaths = await saveRequestRunState(input.root, runtimeState);
    await syncReviewTask(input.root, runtimeState);

    return {
      runId: input.runId,
      intent,
      plan,
      assistantText,
      toolOutcomes,
      savedRunState: savedPaths.runDirectory
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failedTimestamp = new Date().toISOString();
    events.push({
      type: 'run_failed',
      timestamp: failedTimestamp,
      summary: message,
      status: 'failed',
      touched_files: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? [])),
      evidence: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.evidence ?? []))
    });
    const failedState = createRuntimeRunState({
      runId: input.runId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: message,
      status: 'failed',
      events
    });
    await saveRequestRunState(input.root, failedState);
    throw error;
  }
}

function buildToolsForIntent(
  intent: RuntimeIntent,
  runtimeContext: ReturnType<typeof createRuntimeContext>,
  querySynthesizer?: ReturnType<typeof createModelBackedQueryAnswerSynthesizer>,
  knowledgeDraftSynthesizer?: ReturnType<typeof createModelBackedKnowledgePageDraftSynthesizer>
) {
  const wikiObserveTools = [createListWikiPagesTool(runtimeContext), createReadWikiPageTool(runtimeContext)];
  const sourceObserveTools = [
    createListSourceManifestsTool(runtimeContext),
    createReadSourceManifestTool(runtimeContext),
    createReadRawSourceTool(runtimeContext)
  ];

  switch (intent) {
    case 'ingest':
      return [...wikiObserveTools, ...sourceObserveTools, createFindSourceManifestTool(runtimeContext), createIngestSourceTool(runtimeContext)];
    case 'lint':
      return [...wikiObserveTools, createLintWikiTool(runtimeContext)];
    case 'mixed':
      return [
        ...wikiObserveTools,
        ...sourceObserveTools,
        createDraftKnowledgePageTool(runtimeContext, { synthesizeDraft: knowledgeDraftSynthesizer }),
        createDraftQueryPageTool(runtimeContext, { synthesizeAnswer: querySynthesizer }),
        createApplyDraftUpsertTool(runtimeContext),
        createFindSourceManifestTool(runtimeContext),
        createIngestSourceTool(runtimeContext),
        createQueryWikiTool(runtimeContext, { synthesizeAnswer: querySynthesizer }),
        createUpsertKnowledgePageTool(runtimeContext),
        createLintWikiTool(runtimeContext)
      ];
    case 'query':
      return [
        ...wikiObserveTools,
        ...sourceObserveTools,
        createDraftKnowledgePageTool(runtimeContext, { synthesizeDraft: knowledgeDraftSynthesizer }),
        createDraftQueryPageTool(runtimeContext, { synthesizeAnswer: querySynthesizer }),
        createApplyDraftUpsertTool(runtimeContext),
        createQueryWikiTool(runtimeContext, { synthesizeAnswer: querySynthesizer }),
        createUpsertKnowledgePageTool(runtimeContext)
      ];
  }
}

function createInitialPrompt(userRequest: string, intent: RuntimeIntent): RuntimeAgentMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text: buildPromptText(userRequest, intent) }],
    timestamp: Date.now()
  };
}

function buildPromptText(userRequest: string, intent: RuntimeIntent): string {
  const toolGuidance =
    intent === 'ingest'
      ? 'Start by inspecting wiki pages and source manifests when the source reference is ambiguous. Use list_source_manifests and read_source_manifest or find_source_manifest before ingest_source for loose references, and only ingest when there is a unique strongest candidate.'
      : intent === 'lint'
        ? 'Inspect wiki structure first, then use lint_wiki to report findings.'
        : intent === 'mixed'
          ? 'Inspect the wiki and sources first, preferably with list_wiki_pages, read_wiki_page, read_raw_source, list_source_manifests, and read_source_manifest. Use read_wiki_page to inspect incoming links and shared-source relationships before synthesizing. For durable page creation, prefer draft_query_page for reusable answers and draft_knowledge_page for other durable pages, then prefer apply_draft_upsert to apply the structured draft payload through governed writeback. Only fall back to direct upsert_knowledge_page when no structured draft is appropriate. Use the minimum safe combination of query_wiki, draft_knowledge_page, draft_query_page, apply_draft_upsert, upsert_knowledge_page, lint_wiki, and ingest_source.'
          : 'Start with list_wiki_pages using the user request as a navigation query when page selection is unclear, then read_wiki_page and inspect incoming links or shared-source related pages before synthesizing. If the page exposes raw/accepted source refs, follow them with read_raw_source before using query_wiki. When the answer appears durable, prefer draft_query_page first, then apply_draft_upsert; fall back to draft_knowledge_page or direct upsert only when needed.';

  return [`User request: ${userRequest}`, `Detected intent: ${intent}.`, toolGuidance].join(' ');
}

function getLatestAssistantMessage(messages: RuntimeAgentMessage[]): Extract<RuntimeAgentMessage, { role: 'assistant' }> | undefined {
  const assistantMessages = messages.filter(
    (message): message is Extract<RuntimeAgentMessage, { role: 'assistant' }> => message.role === 'assistant'
  );

  return assistantMessages[assistantMessages.length - 1];
}

function collectAssistantText(messages: RuntimeAgentMessage[], toolOutcomes: RuntimeToolOutcome[]): string {
  const latest = getLatestAssistantMessage(messages);

  if (latest) {
    const assistantText = latest.content
      .filter((block): block is Extract<(typeof latest.content)[number], { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (assistantText.length > 0) {
      return assistantText;
    }
  }

  const latestOutcome = toolOutcomes[toolOutcomes.length - 1];

  return latestOutcome?.summary ?? '';
}

export function extractRuntimeToolOutcome(result: AgentToolResult<unknown>): RuntimeToolOutcome {
  return result.details as RuntimeToolOutcome;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
