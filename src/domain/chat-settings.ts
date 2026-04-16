export type ChatModelApi = 'anthropic-messages' | 'openai-completions' | 'openai-responses';

export interface ChatSettings {
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
}

export interface CreateChatSettingsInput {
  model?: string;
  provider?: string;
  api?: ChatModelApi;
  base_url?: string;
  api_key_env?: string;
  reasoning?: boolean;
  context_window?: number;
  max_tokens?: number;
  allow_query_writeback?: boolean;
  allow_lint_autofix?: boolean;
}

const DEFAULT_PROVIDER = 'llm-wiki-liiy';
const DEFAULT_BASE_URL = 'http://runtime.example.invalid/v1';
const DEFAULT_API_KEY_ENV = 'RUNTIME_API_KEY';

export function createChatSettings(input: CreateChatSettingsInput = {}): ChatSettings {
  const provider = normalizeOptionalString(input.provider);
  const api = input.api;
  const base_url = normalizeOptionalString(input.base_url);
  const api_key_env = normalizeOptionalString(input.api_key_env);
  const context_window = normalizePositiveInteger(input.context_window);
  const max_tokens = normalizePositiveInteger(input.max_tokens);

  return {
    model: normalizeOptionalString(input.model) ?? 'gpt-5.4',
    ...(provider === undefined ? { provider: DEFAULT_PROVIDER } : { provider }),
    ...(api === undefined ? { api: 'anthropic-messages' } : { api }),
    ...(base_url === undefined ? { base_url: DEFAULT_BASE_URL } : { base_url }),
    ...(api_key_env === undefined ? { api_key_env: DEFAULT_API_KEY_ENV } : { api_key_env }),
    ...(input.reasoning === undefined ? { reasoning: true } : { reasoning: input.reasoning }),
    ...(context_window === undefined ? {} : { context_window }),
    ...(max_tokens === undefined ? {} : { max_tokens }),
    allow_query_writeback: input.allow_query_writeback ?? false,
    allow_lint_autofix: input.allow_lint_autofix ?? false
  };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}
