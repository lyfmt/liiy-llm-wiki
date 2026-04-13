import { Agent, type AgentToolResult, type StreamFn } from '@mariozechner/pi-agent-core';
import { getModel, type Api, type Message, type Model } from '@mariozechner/pi-ai';

import { createRequestRun } from '../domain/request-run.js';
import { saveRequestRunState } from '../storage/request-run-state-store.js';
import { buildIntentPlan, classifyIntent, type RuntimeIntent } from './intent-classifier.js';
import { createRuntimeContext } from './runtime-context.js';
import { createRuntimeRunState, type RuntimeToolOutcome } from './request-run-state.js';
import { buildRuntimeSystemPrompt } from './system-prompt.js';
import { createIngestSourceTool } from './tools/ingest-source.js';
import { createLintWikiTool } from './tools/lint-wiki.js';
import { createQueryWikiTool } from './tools/query-wiki.js';

export interface RunRuntimeAgentInput {
  root: string;
  userRequest: string;
  runId: string;
  model?: Model<Api>;
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
  const model = input.model ?? getModel('anthropic', 'claude-sonnet-4-20250514');
  const runtimeContext = createRuntimeContext({
    root: input.root,
    runId: input.runId,
    allowQueryWriteback: input.allowQueryWriteback,
    allowLintAutoFix: input.allowLintAutoFix
  });
  const toolOutcomes: RuntimeToolOutcome[] = [];
  const tools = buildToolsForIntent(intent, runtimeContext);
  const agent = new Agent({
    initialState: {
      systemPrompt: buildRuntimeSystemPrompt(intent),
      model,
      tools,
      messages: []
    },
    streamFn: input.streamFn,
    convertToLlm,
    beforeToolCall: async () => undefined,
    afterToolCall: async ({ result }) => {
      const details = result.details as RuntimeToolOutcome;
      toolOutcomes.push(details);

      return undefined;
    }
  });

  try {
    await agent.prompt(createInitialPrompt(input.userRequest, intent));

    const finalAssistant = getLatestAssistantMessage(agent.state.messages as RuntimeAgentMessage[]);

    if (finalAssistant?.stopReason === 'error' || finalAssistant?.stopReason === 'aborted') {
      throw new Error(finalAssistant.errorMessage ?? `Runtime agent ended with ${finalAssistant.stopReason}`);
    }

    const assistantText = collectAssistantText(agent.state.messages as RuntimeAgentMessage[], toolOutcomes);
    const runtimeState = createRuntimeRunState({
      runId: input.runId,
      userRequest: input.userRequest,
      intent,
      plan,
      toolOutcomes,
      assistantSummary: assistantText || 'Runtime completed without assistant text.'
    });
    const savedPaths = await saveRequestRunState(input.root, runtimeState);

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
    const failedState = {
      request_run: createRequestRun({
        run_id: input.runId,
        user_request: input.userRequest,
        intent,
        plan,
        status: 'failed',
        evidence: toolOutcomes.flatMap((outcome) => outcome.evidence ?? []),
        touched_files: toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? []),
        decisions: toolOutcomes.map((outcome) => `${outcome.toolName}: ${outcome.summary}`),
        result_summary: message
      }),
      draft_markdown: '# Runtime Draft\n\nRuntime failed before completion.\n',
      result_markdown: `# Runtime Result\n\nFailed: ${message}\n`,
      changeset: null
    };
    await saveRequestRunState(input.root, failedState);
    throw error;
  }
}

function buildToolsForIntent(intent: RuntimeIntent, runtimeContext: ReturnType<typeof createRuntimeContext>) {
  switch (intent) {
    case 'ingest':
      return [createIngestSourceTool(runtimeContext)];
    case 'lint':
      return [createLintWikiTool(runtimeContext)];
    case 'mixed':
      return [
        createIngestSourceTool(runtimeContext),
        createQueryWikiTool(runtimeContext),
        createLintWikiTool(runtimeContext)
      ];
    case 'query':
      return [createQueryWikiTool(runtimeContext)];
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
      ? 'Use ingest_source with sourceId when known, or sourcePath for explicit raw/accepted/... requests.'
      : intent === 'lint'
        ? 'Use lint_wiki to inspect the wiki and report findings.'
        : intent === 'mixed'
          ? 'Use the minimum safe combination of query_wiki, lint_wiki, and ingest_source.'
          : 'Use query_wiki to answer from the wiki.';

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
