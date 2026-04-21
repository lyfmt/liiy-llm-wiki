import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Agent, type AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type, type Api, type Message, type Model, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { buildProjectPaths } from '../../config/project-paths.js';
import { buildSubagentArtifactPaths, resolveStateArtifactPath, type ResolvedStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { SubagentProfile, SubagentReceipt, RunSubagentInput } from '../subagents/types.js';
import type { RuntimeToolCatalog } from '../tool-catalog.js';

const parameters = Type.Object({
  profile: Type.String({ description: 'Discovered subagent profile name to execute.' }),
  taskPrompt: Type.String({ description: 'Concrete task for the isolated subagent.' }),
  inputArtifacts: Type.Array(Type.String({ description: 'Artifact paths the subagent may read as long-form context.' })),
  outputDir: Type.String({ description: 'Artifact directory for the subagent to write outputs into.' }),
  requestedTools: Type.Optional(Type.Array(Type.String({ description: 'Additional tools requested for this subagent run.' }))),
  successCriteria: Type.Optional(Type.Array(Type.String({ description: 'Optional completion criteria for the subagent.' })))
});

export type RunSubagentParameters = Static<typeof parameters>;

export interface CreateRunSubagentToolOptions {
  profiles: SubagentProfile[];
  toolCatalog: RuntimeToolCatalog;
  model: Model<Api>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
}

type SubagentMessage = Message;

export function createRunSubagentTool(
  runtimeContext: RuntimeContext,
  options: CreateRunSubagentToolOptions
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'run_subagent',
    label: 'Run Subagent',
    description:
      'Execute a bounded task through an isolated subagent profile. Use this when work is long, tool-heavy, or better handled through artifact handoff and a short receipt.',
    parameters,
    execute: async (_toolCallId, params) => {
      const profile = options.profiles.find((candidate) => candidate.name === params.profile);

      if (!profile) {
        throw new Error(`Unknown subagent profile: ${params.profile}`);
      }

      const normalizedInput = normalizeSubagentInput(params);
      const inputArtifacts = normalizeSubagentInputArtifacts(runtimeContext.root, normalizedInput.inputArtifacts);
      const outputDirectory = resolveSubagentOutputDirectory(runtimeContext.root, normalizedInput.outputDir);
      const normalizedOutputDir = outputDirectory.projectPath;
      const effectiveTools = selectEffectiveTools(profile, normalizedInput, options.toolCatalog);
      const scopedTools = effectiveTools.map((toolName) =>
        createScopedSubagentTool(toolName, options.toolCatalog[toolName]!, {
          root: runtimeContext.root,
          inputArtifacts,
          outputDirectory
        })
      );
      const toolOutcomes: RuntimeToolOutcome[] = [];

      await mkdir(outputDirectory.absolutePath, { recursive: true });

      const agent = new Agent({
        initialState: {
          systemPrompt: buildSubagentExecutionPrompt(
            profile,
            normalizedInput,
            inputArtifacts.map((artifact) => artifact.projectPath),
            normalizedOutputDir
          ),
          model: options.model,
          tools: scopedTools,
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

      await agent.prompt(normalizedInput.taskPrompt);

      const finalAssistant = getLatestAssistantMessage(agent.state.messages as SubagentMessage[]);

      if (finalAssistant?.stopReason === 'error' || finalAssistant?.stopReason === 'aborted') {
        throw new Error(finalAssistant.errorMessage ?? `Subagent ended with ${finalAssistant.stopReason}`);
      }

      const assistantText = collectAssistantText(agent.state.messages as SubagentMessage[], toolOutcomes);
      const receipt = parseReceipt(runtimeContext.root, assistantText, toolOutcomes, outputDirectory);
      const evidence = uniqueStrings([profile.filePath, ...toolOutcomes.flatMap((outcome) => outcome.evidence ?? [])]);
      const touchedFiles = uniqueStrings(toolOutcomes.flatMap((outcome) => outcome.touchedFiles ?? []));
      const resultMarkdown = [
        '# Subagent Run',
        '',
        `- Profile: ${profile.name}`,
        `- Task: ${normalizedInput.taskPrompt}`,
        `- Effective tools: ${effectiveTools.join(', ') || '_none_'}`,
        `- Output directory: ${normalizedOutputDir}`,
        '',
        '## Receipt',
        `- Status: ${receipt.status}`,
        `- Summary: ${receipt.summary}`,
        `- Output artifacts: ${receipt.outputArtifacts.join(', ') || '_none_'}`,
        receipt.warnings && receipt.warnings.length > 0 ? `- Warnings: ${receipt.warnings.join(', ')}` : null,
        '',
        '## Tool Outcomes',
        toolOutcomes.length === 0
          ? '_none_'
          : toolOutcomes.map((outcome) => `- ${outcome.toolName}: ${outcome.summary}`).join('\n')
      ]
        .filter((line): line is string => line !== null)
        .join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'run_subagent',
        summary: `ran subagent ${profile.name}`,
        evidence,
        touchedFiles,
        resultMarkdown,
        ...(receipt.status === 'needs_review'
          ? {
              needsReview: true,
              reviewReasons: [receipt.summary]
            }
          : {}),
        data: {
          profile: profile.name,
          effectiveTools,
          receipt
        }
      };

      return {
        content: [{ type: 'text', text: receipt.summary || resultMarkdown }],
        details: outcome
      };
    }
  };
}

function normalizeSubagentInput(input: RunSubagentParameters): RunSubagentInput {
  return {
    profile: input.profile,
    taskPrompt: input.taskPrompt.trim(),
    inputArtifacts: input.inputArtifacts.map((artifactPath) => artifactPath.trim()).filter((artifactPath) => artifactPath.length > 0),
    outputDir: input.outputDir.trim(),
    ...(input.requestedTools ? { requestedTools: input.requestedTools.map((tool) => tool.trim()).filter((tool) => tool.length > 0) } : {}),
    ...(input.successCriteria ? { successCriteria: input.successCriteria.map((item) => item.trim()).filter((item) => item.length > 0) } : {})
  };
}

function selectEffectiveTools(
  profile: SubagentProfile,
  input: RunSubagentInput,
  toolCatalog: RuntimeToolCatalog
): string[] {
  const missingDefaultTools = profile.defaultTools.filter((toolName) => !toolCatalog[toolName]);

  if (missingDefaultTools.length > 0) {
    throw new Error(`Subagent profile references unavailable default tools: ${missingDefaultTools.join(', ')}`);
  }

  return uniqueStrings([...profile.defaultTools, ...(input.requestedTools ?? [])]).filter(
    (toolName) => profile.maxTools.includes(toolName) && Boolean(toolCatalog[toolName])
  );
}

function normalizeSubagentInputArtifacts(root: string, artifactPaths: string[]): ResolvedStateArtifactPath[] {
  const subagentArtifactsRoot = buildProjectPaths(root).stateSubagents;

  return artifactPaths.map((artifactPath) => {
    const resolved = resolveStateArtifactPath(root, artifactPath);

    if (!isWithinDirectory(subagentArtifactsRoot, resolved.absolutePath)) {
      throw new Error('Subagent input artifacts must stay within state/artifacts/subagents/');
    }

    return resolved;
  });
}

function resolveSubagentOutputDirectory(root: string, outputDir: string): ResolvedStateArtifactPath {
  const resolved = resolveStateArtifactPath(root, outputDir);
  const runId = path.basename(resolved.absolutePath);
  const expectedDirectory = buildSubagentArtifactPaths(root, runId).root;

  if (resolved.absolutePath !== expectedDirectory) {
    throw new Error('Subagent output directory must be state/artifacts/subagents/<run-id>');
  }

  return resolved;
}

function buildSubagentExecutionPrompt(
  profile: SubagentProfile,
  input: RunSubagentInput,
  inputArtifacts: string[],
  outputDir: string
): string {
  return [
    '# Identity',
    `You are the isolated subagent "${profile.name}" for llm-wiki-liiy.`,
    'You have an isolated context and must not assume the main agent history is available.',
    'Prefer reading long context from artifacts and writing long outputs back to artifacts.',
    'Return a short JSON receipt at the end of the run.',
    '',
    '# Profile Instructions',
    profile.systemPrompt.trim(),
    '',
    '# Run Contract',
    `Task: ${input.taskPrompt}`,
    `Input artifacts: ${inputArtifacts.join(', ') || '_none_'}`,
    `Output directory: ${outputDir}`,
    `Success criteria: ${(input.successCriteria ?? []).join(' | ') || '_none_'}`,
    '',
    '# Receipt Contract',
    'Return JSON with: status, summary, outputArtifacts, optional counters, optional warnings.',
    'Use outputArtifacts values under state/artifacts/.'
  ].join('\n');
}

function parseReceipt(
  root: string,
  assistantText: string,
  toolOutcomes: RuntimeToolOutcome[],
  outputDirectory: ResolvedStateArtifactPath
): SubagentReceipt {
  try {
    const parsed = JSON.parse(assistantText) as Record<string, unknown>;
    const outputArtifacts = Array.isArray(parsed.outputArtifacts)
      ? parsed.outputArtifacts
          .filter((entry): entry is string => typeof entry === 'string')
          .map((artifactPath) => resolveStateArtifactPath(root, artifactPath))
      : [];
    const invalidOutputArtifact = outputArtifacts.find(
      (artifact) => !isWithinDirectory(outputDirectory.absolutePath, artifact.absolutePath)
    );

    if (invalidOutputArtifact) {
      return {
        status: 'failed',
        summary: `Subagent receipt referenced artifact outside the allowed output directory: ${invalidOutputArtifact.projectPath}`,
        outputArtifacts: []
      };
    }

    if (
      (parsed.status === 'done' || parsed.status === 'needs_review' || parsed.status === 'failed') &&
      typeof parsed.summary === 'string'
    ) {
      return {
        status: parsed.status,
        summary: parsed.summary.trim(),
        outputArtifacts: outputArtifacts.map((artifact) => artifact.projectPath),
        ...(isNumberRecord(parsed.counters) ? { counters: parsed.counters } : {}),
        ...(Array.isArray(parsed.warnings) && parsed.warnings.every((item) => typeof item === 'string')
          ? { warnings: parsed.warnings }
          : {})
      };
    }
  } catch {
    // fall back to a synthesized receipt below
  }

  return {
    status: hasErroredToolOutcome(toolOutcomes) ? 'failed' : 'done',
    summary: assistantText || toolOutcomes.at(-1)?.summary || 'Subagent completed.',
    outputArtifacts: uniqueStrings(
      toolOutcomes
        .flatMap((outcome) => outcome.touchedFiles ?? [])
        .filter((filePath) => filePath.startsWith('state/artifacts/'))
        .filter((filePath) => isWithinDirectory(outputDirectory.projectPath, filePath))
    )
  };
}

function convertToLlm(messages: SubagentMessage[]): Message[] {
  return messages.filter(
    (message): message is Message =>
      message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult'
  );
}

function getLatestAssistantMessage(messages: SubagentMessage[]): Extract<SubagentMessage, { role: 'assistant' }> | undefined {
  const assistantMessages = messages.filter(
    (message): message is Extract<SubagentMessage, { role: 'assistant' }> => message.role === 'assistant'
  );

  return assistantMessages[assistantMessages.length - 1];
}

function collectAssistantText(messages: SubagentMessage[], toolOutcomes: RuntimeToolOutcome[]): string {
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
      summary: normalizeSummary(value.summary, result, fallbackToolName, isError),
      ...(isError
        ? {
            data: {
              ...(isRecord(value.data) ? value.data : {}),
              toolError: true
            }
          }
        : {})
    };
  }

  return {
    toolName: fallbackToolName,
    summary: normalizeSummary(undefined, result, fallbackToolName, isError),
    resultMarkdown: collectToolResultText(result),
    ...(isError ? { data: { toolError: true } } : {})
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

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function hasErroredToolOutcome(toolOutcomes: RuntimeToolOutcome[]): boolean {
  return toolOutcomes.some((outcome) => isRecord(outcome.data) && outcome.data.toolError === true);
}

function createScopedSubagentTool(
  toolName: string,
  tool: RuntimeToolCatalog[string],
  scope: {
    root: string;
    inputArtifacts: ResolvedStateArtifactPath[];
    outputDirectory: ResolvedStateArtifactPath;
  }
): RuntimeToolCatalog[string] {
  if (toolName !== 'read_artifact' && toolName !== 'write_artifact') {
    return tool;
  }

  return {
    ...tool,
    execute: async (toolCallId, params) => {
      const artifactPath = readArtifactPathFromParameters(params);
      const resolved = resolveStateArtifactPath(scope.root, artifactPath);
      const canAccess =
        toolName === 'read_artifact'
          ? isAllowedSubagentRead(scope.inputArtifacts, scope.outputDirectory, resolved)
          : isWithinDirectory(scope.outputDirectory.absolutePath, resolved.absolutePath);

      if (!canAccess) {
        throw new Error(`Subagent artifact access denied: ${resolved.projectPath}`);
      }

      return tool.execute(toolCallId, params);
    }
  };
}

function readArtifactPathFromParameters(params: unknown): string {
  if (isRecord(params) && typeof params.artifactPath === 'string') {
    return params.artifactPath;
  }

  throw new Error('Subagent artifact tools require an artifactPath parameter');
}

function isAllowedSubagentRead(
  inputArtifacts: ResolvedStateArtifactPath[],
  outputDirectory: ResolvedStateArtifactPath,
  candidate: ResolvedStateArtifactPath
): boolean {
  return inputArtifacts.some((artifact) => artifact.absolutePath === candidate.absolutePath)
    || isWithinDirectory(outputDirectory.absolutePath, candidate.absolutePath);
}

function isWithinDirectory(directoryPath: string, targetPath: string): boolean {
  const relativePath = path.relative(directoryPath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
