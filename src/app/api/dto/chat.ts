import type { ChatModelApi } from '../../../domain/chat-settings.js';
import type { RequestRunStatus } from '../../../domain/request-run.js';
import type { RunSummaryDto } from './run.js';

export interface RuntimeReadinessSummaryDto {
  ready: boolean;
  status: 'ready' | 'missing_api_key';
  summary: string;
  issues: string[];
  settings_url: string;
  configured_api_key_env: string;
  project_env_has_configured_key: boolean;
  model: string;
  provider: string;
  api: string;
  base_url: string;
  allow_query_writeback: boolean;
  allow_lint_autofix: boolean;
}

export interface ChatSettingsDto {
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

export interface ProjectEnvDescriptorDto {
  source: 'project_root_env';
  keys: string[];
}

export interface ProjectEnvEditorDto extends ProjectEnvDescriptorDto {
  contents: string;
}

export interface ChatSettingsResponseDto {
  settings: ChatSettingsDto;
  project_env: ProjectEnvEditorDto;
}

export interface ChatSettingsUpdateResponseDto {
  ok: boolean;
  settings: ChatSettingsDto;
  project_env: ProjectEnvEditorDto;
}

export interface ChatOperationsSummaryDto {
  settings: ChatSettingsDto;
  project_env: ProjectEnvDescriptorDto;
  runtime_readiness: RuntimeReadinessSummaryDto;
  recent_runs: RunSummaryDto[];
  suggested_requests: string[];
}

export interface ChatModelCatalogEntryDto {
  id: string;
  name: string;
  provider: string;
  api: ChatModelApi;
  base_url: string;
  api_key_env?: string;
  reasoning: boolean;
  context_window: number;
  max_tokens: number;
  built_in: boolean;
  selected: boolean;
}

export interface ChatModelProviderDto {
  id: string;
  models: ChatModelCatalogEntryDto[];
}

export interface ChatModelsSelectedDto {
  provider: string;
  model: string;
  api?: ChatModelApi;
  base_url?: string;
  api_key_env?: string;
  reasoning?: boolean;
  context_window?: number;
  max_tokens?: number;
}

export interface ChatModelsResponseDto {
  default_provider: string;
  providers: ChatModelProviderDto[];
  selected: ChatModelsSelectedDto;
}

export interface ChatRunLinkSummaryDto {
  run_url: string | null;
  review_url: string | null;
  task_url: string | null;
  task_id: string | null;
  touched_files: string[];
  status: RequestRunStatus | 'failed_preflight';
}

export interface ChatRunAcceptedResponseDto {
  ok: boolean;
  accepted: true;
  runId: string;
  run_id: string;
  intent: string;
  status: RequestRunStatus;
  result_summary: string;
  touched_files: string[];
  plan: string[];
  event_count: number;
  run_url: string;
  review_url: null;
  task_url: null;
  task_id: null;
}

export interface ChatRunCompletedToolOutcomeDto {
  order: number;
  tool_name: string;
  summary: string;
  touched_files: string[];
  needs_review: boolean;
  review_reasons: string[];
}

export interface ChatRunCompletedResponseDto extends ChatRunLinkSummaryDto {
  ok: true;
  runId: string;
  run_id: string;
  intent: string;
  plan: string[];
  result_summary: string;
  tool_outcomes: ChatRunCompletedToolOutcomeDto[];
}

export interface ChatRunFailedResponseDto extends ChatRunLinkSummaryDto {
  ok: false;
  code: 'missing_api_key' | 'runtime_error';
  error: string;
  config_hint: string;
  settings_url: string;
  run_id: string | null;
  result_summary: string;
  model?: string;
  provider?: string;
  base_url?: string;
  missing_api_key_env?: string;
}
