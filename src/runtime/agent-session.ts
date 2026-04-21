import { Agent, type AgentToolResult, type StreamFn } from '@mariozechner/pi-agent-core';
import { type Api, type Message, type Model } from '@mariozechner/pi-ai';

import { loadChatSettings } from '../storage/chat-settings-store.js';
import { saveRequestRunState, type RequestRunEvent } from '../storage/request-run-state-store.js';
import { findIngestibleSourceManifestByPath } from '../storage/source-manifest-store.js';
import { runIngestFlow } from '../flows/ingest/run-ingest-flow.js';
import { syncReviewTask } from '../flows/review/sync-review-task.js';
import { buildIntentPlan, classifyIntent, type RuntimeIntent } from './intent-classifier.js';
import { discoverRuntimeSkills } from './skills/discovery.js';
import { discoverRuntimeSubagents } from './subagents/discovery.js';
import { buildRuntimeToolCatalog } from './tool-catalog.js';
import {
  appendRuntimeSystemContext,
  createRuntimeContextReminderMessage,
  getRuntimeSystemContext,
  getRuntimeUserContext
} from './prompt-context.js';
import { resolveRuntimeModel } from './resolve-runtime-model.js';
import { createRuntimeContext } from './runtime-context.js';
import { createRuntimeRunState, type RuntimeToolOutcome } from './request-run-state.js';
import { buildRuntimeSystemPrompt } from './system-prompt.js';
import type { ChatAttachmentRef } from '../domain/chat-attachment.js';
import type { RuntimeConversationMessage, RuntimeUserMessage } from './chat-message-content.js';
import {
  createModelBackedKnowledgePageDraftSynthesizer
} from './tools/draft-knowledge-page.js';
import { createModelBackedQueryAnswerSynthesizer } from './tools/query-wiki.js';
import { createReadSkillTool } from './tools/read-skill.js';
import { createRunSubagentTool } from './tools/run-subagent.js';
import { createRunSkillTool } from './tools/run-skill.js';
import type { SkillSummary } from './skills/types.js';
import type { SubagentProfile } from './subagents/types.js';

export interface RunRuntimeAgentInput {
  root: string;
  userRequest: string;
  runId: string;
  sessionId?: string;
  conversationHistory?: RuntimeConversationMessage[];
  currentUserMessage?: RuntimeUserMessage;
  attachments?: ChatAttachmentRef[];
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
  const runtimeContext = createRuntimeContext({
    root: input.root,
    runId: input.runId,
    sessionId: input.sessionId,
    allowQueryWriteback: input.allowQueryWriteback,
    allowLintAutoFix: input.allowLintAutoFix
  });
  const deterministicIngestResult = await tryRunDeterministicIngestShortcut(input, intent, plan, runtimeContext);

  if (deterministicIngestResult) {
    return deterministicIngestResult;
  }

  const resolvedRuntimeModel = input.model
    ? {
        model: input.model,
        getApiKey: input.getApiKey ?? (() => undefined)
      }
    : resolveRuntimeModel(await loadChatSettings(input.root), { root: input.root });
  const toolOutcomes: RuntimeToolOutcome[] = [];
  const events: RequestRunEvent[] = [];
  const querySynthesizer =
    input.streamFn === undefined
      ? createModelBackedQueryAnswerSynthesizer({
          model: resolvedRuntimeModel.model,
          getApiKey: resolvedRuntimeModel.getApiKey,
          sessionId: input.sessionId ?? input.runId
        })
      : undefined;
  const knowledgeDraftSynthesizer =
    input.streamFn === undefined
      ? createModelBackedKnowledgePageDraftSynthesizer({
          model: resolvedRuntimeModel.model,
          getApiKey: resolvedRuntimeModel.getApiKey,
          sessionId: input.sessionId ?? input.runId
        })
      : undefined;
  const [runtimeUserContext, runtimeSystemContext] = await Promise.all([
    getRuntimeUserContext(input.root),
    Promise.resolve(
      getRuntimeSystemContext({
        root: input.root,
        intent,
        runId: input.runId,
        sessionId: input.sessionId,
        allowQueryWriteback: input.allowQueryWriteback,
        allowLintAutoFix: input.allowLintAutoFix
      })
    )
  ]);
  const [discoveredSkills, discoveredSubagents] = await Promise.all([
    discoverRuntimeSkills(input.root),
    discoverRuntimeSubagents(input.root)
  ]);
  const tools = buildRuntimeTools(
    runtimeContext,
    resolvedRuntimeModel.model,
    resolvedRuntimeModel.getApiKey,
    querySynthesizer,
    knowledgeDraftSynthesizer,
    discoveredSkills.skills,
    discoveredSubagents.profiles
  );
  const initialMessages = buildInitialMessages(runtimeUserContext, input.conversationHistory);
  const persistRuntimeSnapshot = async (overrides?: {
    status?: 'running' | 'needs_review' | 'done' | 'failed';
    assistantSummary?: string;
  }) => {
    const runtimeState = createRuntimeRunState({
      runId: input.runId,
      sessionId: input.sessionId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: overrides?.assistantSummary ?? collectAssistantText(agent.state.messages as RuntimeAgentMessage[], toolOutcomes),
      status: overrides?.status,
      events,
      attachments: input.attachments
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
      systemPrompt: appendRuntimeSystemContext(
        buildRuntimeSystemPrompt(intent, {
          skills: discoveredSkills.skills,
          subagents: discoveredSubagents.profiles
        }),
        runtimeSystemContext
      ),
      model: resolvedRuntimeModel.model,
      tools,
      messages: initialMessages
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

      if (toolCall.name === 'run_subagent') {
        const profile = isRecord(toolCall.arguments) && typeof toolCall.arguments.profile === 'string'
          ? toolCall.arguments.profile
          : 'unknown';

        await appendEvent(
          {
            type: 'subagent_spawned',
            timestamp: new Date().toISOString(),
            summary: `Spawned subagent ${profile}`,
            status: 'running',
            tool_name: toolCall.name,
            tool_call_id: toolCall.id,
            data: { profile }
          },
          { status: 'running', assistantSummary: `Spawning subagent ${profile}…` }
        );
      }

      return undefined;
    },
    afterToolCall: async ({ toolCall, result, isError }) => {
      const details = normalizeRuntimeToolOutcome(toolCall.name, result, isError);
      toolOutcomes.push(details);
      const eventTimestamp = new Date().toISOString();
      const evidence = details.evidence ?? [];
      const touchedFiles = details.touchedFiles ?? [];
      const toolSummary = `${details.toolName}: ${details.summary}`;

      await appendEvent(
        {
          type: 'tool_finished',
          timestamp: eventTimestamp,
          summary: toolSummary,
          status: 'running',
          tool_name: details.toolName,
          tool_call_id: toolCall.id,
          evidence,
          touched_files: touchedFiles,
          data: details.data
        },
        { status: 'running', assistantSummary: toolSummary }
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
          { status: 'running', assistantSummary: toolSummary }
        );
      }

      if (typeof details.resultMarkdown === 'string' && details.resultMarkdown.length > 0 && !isError) {
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
          { status: 'running', assistantSummary: toolSummary }
        );
      }

      if (details.toolName === 'run_subagent') {
        const profile = isRecord(details.data) && typeof details.data.profile === 'string'
          ? details.data.profile
          : toolCall.name;
        const receipt = isRecord(details.data) && isRecord(details.data.receipt)
          ? details.data.receipt
          : undefined;
        const receiptStatus = typeof receipt?.status === 'string' ? receipt.status : undefined;
        const lifecycleFailed = isError || receiptStatus === 'failed';
        const lifecycleType = lifecycleFailed ? 'subagent_failed' : 'subagent_completed';
        const lifecycleSummary = lifecycleFailed ? `Subagent ${profile} failed` : `Subagent ${profile} completed`;
        const lifecycleStatus = lifecycleFailed
          ? 'failed'
          : receiptStatus === 'needs_review'
            ? 'needs_review'
            : 'done';

        await appendEvent(
          {
            type: lifecycleType,
            timestamp: eventTimestamp,
            summary: lifecycleSummary,
            status: lifecycleStatus,
            tool_name: details.toolName,
            tool_call_id: toolCall.id,
            evidence,
            touched_files: touchedFiles,
            data: {
              ...(typeof profile === 'string' ? { profile } : {}),
              ...(receipt ? { receipt } : {})
            }
          },
          { status: 'running', assistantSummary: toolSummary }
        );
      }

      return {
        details
      };
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

    if (input.currentUserMessage) {
      await agent.prompt({
        role: 'user',
        content: input.currentUserMessage.content,
        timestamp: input.currentUserMessage.timestamp ?? Date.now()
      });
    } else {
      await agent.prompt(input.userRequest);
    }

    const finalAssistant = getLatestAssistantMessage(agent.state.messages as RuntimeAgentMessage[]);

    if (finalAssistant?.stopReason === 'error' || finalAssistant?.stopReason === 'aborted') {
      throw new Error(finalAssistant.errorMessage ?? `Runtime agent ended with ${finalAssistant.stopReason}`);
    }

    const assistantText = collectAssistantText(agent.state.messages as RuntimeAgentMessage[], toolOutcomes);
    const finalRuntimeStatus = deriveFinalRuntimeStatus(toolOutcomes);
    const finalRuntimeEventType = finalRuntimeStatus === 'failed' ? 'run_failed' : 'run_completed';
    await appendEvent(
      {
        type: finalRuntimeEventType,
        timestamp: new Date().toISOString(),
        summary: assistantText || 'Runtime completed without assistant text.',
        status: finalRuntimeStatus,
        touched_files: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? [])),
        evidence: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.evidence ?? []))
      },
      {
        status: finalRuntimeStatus,
        assistantSummary: assistantText || 'Runtime completed without assistant text.'
      }
    );
    const runtimeState = createRuntimeRunState({
      runId: input.runId,
      sessionId: input.sessionId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: assistantText || 'Runtime completed without assistant text.',
      events,
      attachments: input.attachments
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
      sessionId: input.sessionId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: message,
      status: 'failed',
      events,
      attachments: input.attachments
    });
    await saveRequestRunState(input.root, failedState);
    throw error;
  }
}

function buildRuntimeTools(
  runtimeContext: ReturnType<typeof createRuntimeContext>,
  model: Model<Api>,
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined,
  querySynthesizer?: ReturnType<typeof createModelBackedQueryAnswerSynthesizer>,
  knowledgeDraftSynthesizer?: ReturnType<typeof createModelBackedKnowledgePageDraftSynthesizer>,
  skills: SkillSummary[] = [],
  subagents: SubagentProfile[] = []
) {
  const catalog = buildRuntimeToolCatalog(runtimeContext, {
    querySynthesizer,
    knowledgeDraftSynthesizer
  });
  const runSubagentTool = createRunSubagentTool(runtimeContext, {
    profiles: subagents,
    toolCatalog: catalog,
    model,
    getApiKey
  });
  const skillToolCatalog = {
    ...catalog,
    run_subagent: runSubagentTool
  };
  const skillOwnedTools = new Set(skills.flatMap((skill) => skill.allowedTools));
  const exposedCatalogTools = Object.values(catalog).filter((tool) => !skillOwnedTools.has(tool.name));

  return [
    ...exposedCatalogTools,
    createReadSkillTool(runtimeContext, { skills }),
    createRunSkillTool(runtimeContext, {
      skills,
      toolCatalog: skillToolCatalog,
      model,
      getApiKey
    }),
    runSubagentTool
  ];
}

function buildInitialMessages(
  userContext: Record<string, string>,
  conversationHistory?: RuntimeConversationMessage[]
): RuntimeAgentMessage[] {
  const initialMessages: RuntimeAgentMessage[] = [];
  const contextReminder = createRuntimeContextReminderMessage(userContext);

  if (contextReminder) {
    initialMessages.push({
      role: 'user',
      content: [{ type: 'text', text: contextReminder }],
      timestamp: Date.now()
    });
  }

  if (conversationHistory && conversationHistory.length > 0) {
    for (const message of conversationHistory.slice(-8)) {
      initialMessages.push(
        message.role === 'user'
          ? {
              role: 'user',
              content: message.content,
              timestamp: Date.now()
            }
          : createSyntheticAssistantHistoryMessage(message.content)
      );
    }
  }

  return initialMessages;
}

function createSyntheticAssistantHistoryMessage(content: string): Extract<RuntimeAgentMessage, { role: 'assistant' }> {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'runtime-history',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    },
    stopReason: 'stop',
    timestamp: Date.now()
  };
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

function deriveFinalRuntimeStatus(toolOutcomes: RuntimeToolOutcome[]): 'done' | 'needs_review' | 'failed' {
  if (toolOutcomes.some((outcome) => isFailedSubagentOutcome(outcome))) {
    return 'failed';
  }

  if (toolOutcomes.some((outcome) => outcome.needsReview)) {
    return 'needs_review';
  }

  return 'done';
}

function isFailedSubagentOutcome(outcome: RuntimeToolOutcome): boolean {
  return outcome.toolName === 'run_subagent'
    && isRecord(outcome.data)
    && isRecord(outcome.data.receipt)
    && outcome.data.receipt.status === 'failed';
}

function normalizeRuntimeToolOutcome(
  fallbackToolName: string,
  result: AgentToolResult<unknown>,
  isError: boolean
): RuntimeToolOutcome {
  const value = result.details;

  if (isRuntimeToolOutcomeLike(value)) {
    return {
      ...value,
      toolName: normalizeToolName(value.toolName, fallbackToolName),
      summary: normalizeSummary(value.summary, result, fallbackToolName, isError)
    };
  }

  return {
    toolName: fallbackToolName,
    summary: normalizeSummary(undefined, result, fallbackToolName, isError),
    resultMarkdown: collectToolResultText(result)
  };
}

function isRuntimeToolOutcomeLike(value: unknown): value is RuntimeToolOutcome {
  return isRecord(value) && (typeof value.toolName === 'string' || typeof value.summary === 'string');
}

function normalizeToolName(value: unknown, fallbackToolName: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallbackToolName;
}

function normalizeSummary(
  value: unknown,
  result: AgentToolResult<unknown>,
  fallbackToolName: string,
  isError: boolean
): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  const text = collectToolResultText(result);

  if (text.length > 0) {
    return text;
  }

  return isError ? `${fallbackToolName} failed` : `${fallbackToolName} completed`;
}

function collectToolResultText(result: AgentToolResult<unknown>): string {
  return result.content
    .filter((block): block is Extract<(typeof result.content)[number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text.trim())
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();
}

export function extractRuntimeToolOutcome(result: AgentToolResult<unknown>): RuntimeToolOutcome {
  return normalizeRuntimeToolOutcome('unknown_tool', result, false);
}

async function tryRunDeterministicIngestShortcut(
  input: RunRuntimeAgentInput,
  intent: RuntimeIntent,
  plan: string[],
  runtimeContext: ReturnType<typeof createRuntimeContext>
): Promise<RunRuntimeAgentResult | null> {
  if (intent !== 'ingest') {
    return null;
  }

  const sourcePath = extractAcceptedRawSourcePath(input.userRequest);

  if (!sourcePath) {
    return null;
  }

  const events: RequestRunEvent[] = [];
  const appendEvent = (event: RequestRunEvent) => {
    events.push(event);
  };

  appendEvent({
    type: 'run_started',
    timestamp: new Date().toISOString(),
    summary: `Run started for ${intent} request`,
    status: 'running'
  });
  appendEvent({
    type: 'plan_available',
    timestamp: new Date().toISOString(),
    summary: `Plan ready with ${plan.length} step${plan.length === 1 ? '' : 's'}`,
    status: 'running',
    data: { plan }
  });
  appendEvent({
    type: 'tool_started',
    timestamp: new Date().toISOString(),
    summary: 'Starting ingest_source',
    status: 'running',
    tool_name: 'ingest_source',
    tool_call_id: 'deterministic-ingest-shortcut',
    data: { sourcePath }
  });

  try {
    const manifest = await findIngestibleSourceManifestByPath(input.root, sourcePath);
    const ingestResult = await runIngestFlow(input.root, {
      runId: runtimeContext.allocateToolRunId('ingest'),
      userRequest: `ingest ${sourcePath}`,
      sourceId: manifest.id
    });
    const summary = ingestResult.review.needs_review ? 'ingest requires review' : 'ingest completed';
    const resultMarkdown = ingestResult.review.needs_review
      ? `Resolved ${sourcePath} to ${manifest.id}. Queued for review: ${ingestResult.review.reasons.join('; ')}`
      : `Resolved ${sourcePath} to ${manifest.id}. Persisted: ${ingestResult.persisted.join(', ') || '_none_'}`;
    const toolOutcomes: RuntimeToolOutcome[] = [
      {
        toolName: 'ingest_source',
        summary,
        evidence: ingestResult.changeSet.source_refs,
        touchedFiles: ingestResult.persisted,
        changeSet: ingestResult.changeSet,
        needsReview: ingestResult.review.needs_review,
        reviewReasons: ingestResult.review.reasons,
        resultMarkdown
      }
    ];
    const toolSummary = `ingest_source: ${summary}`;

    appendEvent({
      type: 'tool_finished',
      timestamp: new Date().toISOString(),
      summary: toolSummary,
      status: 'running',
      tool_name: 'ingest_source',
      tool_call_id: 'deterministic-ingest-shortcut',
      evidence: toolOutcomes[0].evidence ?? [],
      touched_files: toolOutcomes[0].touchedFiles ?? []
    });

    if ((toolOutcomes[0].evidence ?? []).length > 0) {
      appendEvent({
        type: 'evidence_added',
        timestamp: new Date().toISOString(),
        summary: `ingest_source added ${(toolOutcomes[0].evidence ?? []).length} evidence reference${(toolOutcomes[0].evidence ?? []).length === 1 ? '' : 's'}`,
        status: 'running',
        tool_name: 'ingest_source',
        tool_call_id: 'deterministic-ingest-shortcut',
        evidence: toolOutcomes[0].evidence ?? []
      });
    }

    appendEvent({
      type: 'draft_updated',
      timestamp: new Date().toISOString(),
      summary: 'ingest_source produced operator-visible output',
      status: 'running',
      tool_name: 'ingest_source',
      tool_call_id: 'deterministic-ingest-shortcut',
      touched_files: toolOutcomes[0].touchedFiles ?? []
    });

    appendEvent({
      type: 'run_completed',
      timestamp: new Date().toISOString(),
      summary: resultMarkdown,
      status: toolOutcomes.some((outcome) => outcome.needsReview) ? 'needs_review' : 'done',
      touched_files: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? [])),
      evidence: uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.evidence ?? []))
    });

    const runtimeState = createRuntimeRunState({
      runId: input.runId,
      sessionId: input.sessionId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: resultMarkdown,
      status: toolOutcomes.some((outcome) => outcome.needsReview) ? 'needs_review' : 'done',
      events
    });
    const savedPaths = await saveRequestRunState(input.root, runtimeState);
    await syncReviewTask(input.root, runtimeState);

    return {
      runId: input.runId,
      intent,
      plan,
      assistantText: resultMarkdown,
      toolOutcomes,
      savedRunState: savedPaths.runDirectory
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    appendEvent({
      type: 'run_failed',
      timestamp: new Date().toISOString(),
      summary: message,
      status: 'failed'
    });
    const failedState = createRuntimeRunState({
      runId: input.runId,
      sessionId: input.sessionId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes: [],
      assistantSummary: message,
      status: 'failed',
      events
    });
    await saveRequestRunState(input.root, failedState);
    throw error;
  }
}

function extractAcceptedRawSourcePath(userRequest: string): string | null {
  const match = userRequest.match(/raw\/accepted\/[A-Za-z0-9._/-]+/i);
  return match ? match[0] : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
