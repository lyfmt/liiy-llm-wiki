import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';
import { createChatSettings, type ChatModelApi, type ChatSettings } from '../domain/chat-settings.js';

export async function loadChatSettings(root: string): Promise<ChatSettings> {
  const filePath = buildProjectPaths(root).stateChatSettings;

  try {
    return createChatSettings(assertChatSettingsRecord(JSON.parse(await readFile(filePath, 'utf8')), 'chat-settings.json'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createChatSettings();
    }

    if (error instanceof SyntaxError) {
      throw new Error('Invalid chat settings: malformed chat-settings.json');
    }

    throw error;
  }
}

export async function saveChatSettings(root: string, settings: ChatSettings): Promise<string> {
  const filePath = buildProjectPaths(root).stateChatSettings;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

  return filePath;
}

function assertChatSettingsRecord(
  value: unknown,
  fileName: string
): {
  model: string;
  provider?: string;
  api?: ChatModelApi;
  base_url?: string;
  api_key_env?: string;
  reasoning?: boolean;
  context_window?: number;
  max_tokens?: number;
  allow_query_writeback: boolean;
  allow_lint_autofix: boolean;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (typeof value.model !== 'string') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (value.provider !== undefined && typeof value.provider !== 'string') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (value.api !== undefined && value.api !== 'anthropic-messages' && value.api !== 'openai-completions' && value.api !== 'openai-responses') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (value.base_url !== undefined && typeof value.base_url !== 'string') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (value.api_key_env !== undefined && typeof value.api_key_env !== 'string') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (value.reasoning !== undefined && typeof value.reasoning !== 'boolean') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (
    value.context_window !== undefined &&
    (typeof value.context_window !== 'number' || !Number.isInteger(value.context_window) || value.context_window <= 0)
  ) {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (
    value.max_tokens !== undefined &&
    (typeof value.max_tokens !== 'number' || !Number.isInteger(value.max_tokens) || value.max_tokens <= 0)
  ) {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (typeof value.allow_query_writeback !== 'boolean') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  if (typeof value.allow_lint_autofix !== 'boolean') {
    throw new Error(`Invalid chat settings: invalid ${fileName}`);
  }

  return {
    model: value.model,
    provider: value.provider,
    api: value.api,
    base_url: value.base_url,
    api_key_env: value.api_key_env,
    reasoning: value.reasoning,
    context_window: typeof value.context_window === 'number' ? value.context_window : undefined,
    max_tokens: typeof value.max_tokens === 'number' ? value.max_tokens : undefined,
    allow_query_writeback: value.allow_query_writeback,
    allow_lint_autofix: value.allow_lint_autofix
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
