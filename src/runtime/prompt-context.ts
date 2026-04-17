import { readFile } from 'node:fs/promises';

import { buildProjectPaths } from '../config/project-paths.js';
import type { RuntimeIntent } from './intent-classifier.js';

export interface BuildRuntimePromptContextInput {
  root: string;
  intent: RuntimeIntent;
  runId: string;
  sessionId?: string;
  allowQueryWriteback?: boolean;
  allowLintAutoFix?: boolean;
}

export async function getRuntimeUserContext(root: string): Promise<Record<string, string>> {
  const projectPaths = buildProjectPaths(root);
  const [agentRules, updatePolicy] = await Promise.all([
    readOptionalText(projectPaths.schemaAgentRules),
    readOptionalText(projectPaths.schemaUpdatePolicy)
  ]);

  return {
    currentDate: `Today's date is ${getLocalISODate()}.`,
    ...(agentRules ? { projectAgentRules: agentRules.trim() } : {}),
    ...(updatePolicy ? { projectUpdatePolicy: updatePolicy.trim() } : {})
  };
}

export function getRuntimeSystemContext(input: BuildRuntimePromptContextInput): Record<string, string> {
  return {
    interactionHint: describeIntentHint(input.intent),
    runtimeFlags: [
      `query writeback: ${input.allowQueryWriteback ? 'enabled' : 'disabled'}`,
      `lint autofix: ${input.allowLintAutoFix ? 'enabled' : 'disabled'}`
    ].join('; '),
    session: [
      `run id: ${input.runId}`,
      input.sessionId ? `session id: ${input.sessionId}` : null
    ]
      .filter((value): value is string => value !== null)
      .join('; ')
  };
}

export function appendRuntimeSystemContext(
  systemPrompt: string,
  context: Record<string, string>
): string {
  const renderedContext = Object.entries(context)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  return renderedContext.length > 0
    ? `${systemPrompt}\n\n# Runtime Context\n${renderedContext}`
    : systemPrompt;
}

export function createRuntimeContextReminderMessage(context: Record<string, string>): string | null {
  const entries = Object.entries(context);

  if (entries.length === 0) {
    return null;
  }

  return [
    '<system-reminder>',
    "As you answer the user's requests, you can use the following context:",
    ...entries.map(([key, value]) => `# ${key}\n${value}`),
    '',
    'IMPORTANT: this context may or may not be relevant to your task. Use it only when it genuinely helps you decide or answer better.',
    '</system-reminder>'
  ].join('\n');
}

function describeIntentHint(intent: RuntimeIntent): string {
  switch (intent) {
    case 'general':
      return 'This likely behaves like ordinary chat or a lightweight request. Do not force wiki lookup or tool use unless it is truly helpful.';
    case 'ingest':
      return 'The user likely wants source ingestion or source-oriented maintenance. Resolve ambiguity before ingesting.';
    case 'query':
      return 'The user may want project-specific knowledge, but you should still decide whether direct answering, lightweight reading, or wiki synthesis is actually needed.';
    case 'lint':
      return 'The user likely wants inspection, validation, or cleanup of wiki quality. Prefer inspection before mutation.';
    case 'mixed':
      return 'The request may combine answering, exploration, and maintenance. Choose the minimum safe tool sequence instead of following a fixed workflow.';
  }
}

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function getLocalISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
