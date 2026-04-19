import { Agent, type AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Api, type Message, type Model, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { loadRuntimeSkillDocument } from '../skills/discovery.js';
import type { SkillSummary } from '../skills/types.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { RuntimeToolCatalog } from '../tool-catalog.js';

const parameters = Type.Object({
  name: Type.String({ description: 'Discovered skill name to execute.' }),
  task: Type.String({ description: 'Concrete task for the selected skill agent to perform.' })
});

export type RunSkillParameters = Static<typeof parameters>;

export interface CreateRunSkillToolOptions {
  skills: SkillSummary[];
  toolCatalog: RuntimeToolCatalog;
  model: Model<Api>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
}

type SkillAgentMessage = Message;

export function createRunSkillTool(
  _runtimeContext: RuntimeContext,
  options: CreateRunSkillToolOptions
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'run_skill',
    label: 'Run Skill',
    description:
      'Execute a discovered project skill through an isolated skill agent. Use this after reading a skill when you want the skill-owned toolset without exposing those tools to the main agent.',
    parameters,
    execute: async (_toolCallId, params) => {
      const skillSummary = options.skills.find((candidate) => candidate.name === params.name);

      if (!skillSummary) {
        throw new Error(`Unknown skill: ${params.name}`);
      }

      const skill = await loadRuntimeSkillDocument(skillSummary);
      const allowedTools = skill.allowedTools;

      if (allowedTools.length === 0) {
        throw new Error(`Skill does not declare allowed tools: ${skill.name}`);
      }

      const missingTools = allowedTools.filter((toolName) => !options.toolCatalog[toolName]);

      if (missingTools.length > 0) {
        throw new Error(`Skill references unavailable tools: ${missingTools.join(', ')}`);
      }

      const toolOutcomes: RuntimeToolOutcome[] = [];
      const agent = new Agent({
        initialState: {
          systemPrompt: buildSkillExecutionPrompt(skill.name, skill.source),
          model: options.model,
          tools: allowedTools.map((toolName) => options.toolCatalog[toolName]!),
          messages: []
        },
        getApiKey: options.getApiKey,
        convertToLlm,
        beforeToolCall: async () => undefined,
        afterToolCall: async ({ toolCall, result, isError }) => {
          const details = normalizeRuntimeToolOutcome(toolCall.name, result, isError);
          toolOutcomes.push(details);

          return {
            details
          };
        }
      });

      await agent.prompt(params.task);

      const finalAssistant = getLatestAssistantMessage(agent.state.messages as SkillAgentMessage[]);

      if (finalAssistant?.stopReason === 'error' || finalAssistant?.stopReason === 'aborted') {
        throw new Error(finalAssistant.errorMessage ?? `Skill agent ended with ${finalAssistant.stopReason}`);
      }

      const assistantText = collectAssistantText(agent.state.messages as SkillAgentMessage[], toolOutcomes);
      const evidence = uniqueStrings([skill.filePath, ...toolOutcomes.flatMap((outcome) => outcome.evidence ?? [])]);
      const touchedFiles = uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? []));
      const resultMarkdown = [
        '# Skill Run',
        '',
        `- Skill: ${skill.name}`,
        `- Task: ${params.task}`,
        `- Allowed tools: ${allowedTools.join(', ')}`,
        '',
        '## Tool Outcomes',
        toolOutcomes.length === 0
          ? '_none_'
          : toolOutcomes.map((outcome) => `- ${outcome.toolName}: ${outcome.summary}`).join('\n'),
        '',
        '## Assistant Result',
        assistantText || '_empty_'
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'run_skill',
        summary: `ran skill ${skill.name}`,
        evidence,
        touchedFiles,
        resultMarkdown,
        data: {
          name: skill.name,
          allowedTools,
          toolOutcomes: toolOutcomes.map((toolOutcome) => ({
            toolName: toolOutcome.toolName,
            summary: toolOutcome.summary
          }))
        }
      };

      return {
        content: [{ type: 'text', text: assistantText || resultMarkdown }],
        details: outcome
      };
    }
  };
}

function buildSkillExecutionPrompt(name: string, source: string): string {
  return [
    '# Identity',
    `You are the isolated skill agent for "${name}" in llm-wiki-liiy.`,
    'Use only the provided toolset for this skill.',
    'Do not claim reads or writes that you did not actually execute.',
    'If the task cannot be completed with the available tools, say so plainly.',
    '',
    '# Skill Document',
    source.trim()
  ].join('\n');
}

function convertToLlm(messages: SkillAgentMessage[]): Message[] {
  return messages.filter(
    (message): message is Message =>
      message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'
  );
}

function getLatestAssistantMessage(messages: SkillAgentMessage[]): Extract<SkillAgentMessage, { role: 'assistant' }> | undefined {
  const assistantMessages = messages.filter(
    (message): message is Extract<SkillAgentMessage, { role: 'assistant' }> => message.role === 'assistant'
  );

  return assistantMessages[assistantMessages.length - 1];
}

function collectAssistantText(messages: SkillAgentMessage[], toolOutcomes: RuntimeToolOutcome[]): string {
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

  return toolOutcomes.at(-1)?.summary ?? '';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
