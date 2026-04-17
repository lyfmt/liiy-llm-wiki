import type {
  ChatActionDto,
  ChatModelCatalogEntryDto,
  ChatModelsResponseDto,
  ChatOperationsSummaryDto,
  ChatRunAcceptedResponseDto,
  ChatRunCompletedResponseDto,
  ChatRunFailedResponseDto,
  ChatRunLinkSummaryDto,
  ChatRunUiStateDto,
  ChatSessionDetailDto,
  ChatSessionSummaryDto,
  ChatSettingsDto,
  ChatSettingsResponseDto,
  ChatSettingsUpdateResponseDto,
  ProjectEnvDescriptorDto,
  ProjectEnvEditorDto,
  RuntimeReadinessSummaryDto
} from '../dto/chat.js';
export type { RuntimeReadinessSummaryDto } from '../dto/chat.js';
import type { RunSummaryDto } from '../dto/run.js';
import type { ChatSettings } from '../../../domain/chat-settings.js';
import type { RequestRunStatus } from '../../../domain/request-run.js';
import type { RuntimeModelCatalog } from '../../../runtime/resolve-runtime-model.js';
import type { RequestRunState } from '../../../storage/request-run-state-store.js';

export function toChatSettingsDto(settings: ChatSettings): ChatSettingsDto {
  return {
    model: settings.model,
    ...(settings.provider === undefined ? {} : { provider: settings.provider }),
    ...(settings.api === undefined ? {} : { api: settings.api }),
    ...(settings.base_url === undefined ? {} : { base_url: settings.base_url }),
    ...(settings.api_key_env === undefined ? {} : { api_key_env: settings.api_key_env }),
    ...(settings.reasoning === undefined ? {} : { reasoning: settings.reasoning }),
    ...(settings.context_window === undefined ? {} : { context_window: settings.context_window }),
    ...(settings.max_tokens === undefined ? {} : { max_tokens: settings.max_tokens }),
    allow_query_writeback: settings.allow_query_writeback,
    allow_lint_autofix: settings.allow_lint_autofix
  };
}

export function toRuntimeReadinessSummaryDto(summary: RuntimeReadinessSummaryDto): RuntimeReadinessSummaryDto {
  return {
    ...summary,
    issues: [...summary.issues]
  };
}

export function toChatSettingsResponseDto(input: {
  settings: ChatSettings;
  project_env: {
    keys: string[];
    contents: string;
  };
}): ChatSettingsResponseDto {
  return {
    settings: toChatSettingsDto(input.settings),
    project_env: toProjectEnvEditorDto(input.project_env)
  };
}

export function toChatSettingsUpdateResponseDto(input: {
  settings: ChatSettings;
  project_env: {
    keys: string[];
    contents: string;
  };
}): ChatSettingsUpdateResponseDto {
  return {
    ok: true,
    settings: toChatSettingsDto(input.settings),
    project_env: toProjectEnvEditorDto(input.project_env)
  };
}

export function toChatOperationsSummaryDto(input: {
  settings: ChatSettings;
  project_env: {
    keys: string[];
  };
  runtime_readiness: RuntimeReadinessSummaryDto;
  recent_runs: RunSummaryDto[];
  suggested_requests: string[];
}): ChatOperationsSummaryDto {
  return {
    settings: toChatSettingsDto(input.settings),
    project_env: toProjectEnvDescriptorDto(input.project_env),
    runtime_readiness: toRuntimeReadinessSummaryDto(input.runtime_readiness),
    recent_runs: input.recent_runs.map((run) => ({ ...run, touched_files: [...run.touched_files] })),
    suggested_requests: [...input.suggested_requests]
  };
}

export function toChatModelsResponseDto(catalog: RuntimeModelCatalog): ChatModelsResponseDto {
  return {
    default_provider: catalog.defaultProvider,
    providers: catalog.providers.map((provider) => ({
      id: provider.id,
      models: provider.models.map(toChatModelCatalogEntryDto)
    })),
    selected: {
      provider: catalog.selected.provider,
      model: catalog.selected.model,
      ...(catalog.selected.api === undefined ? {} : { api: catalog.selected.api }),
      ...(catalog.selected.base_url === undefined ? {} : { base_url: catalog.selected.base_url }),
      ...(catalog.selected.api_key_env === undefined ? {} : { api_key_env: catalog.selected.api_key_env }),
      ...(catalog.selected.reasoning === undefined ? {} : { reasoning: catalog.selected.reasoning }),
      ...(catalog.selected.context_window === undefined ? {} : { context_window: catalog.selected.context_window }),
      ...(catalog.selected.max_tokens === undefined ? {} : { max_tokens: catalog.selected.max_tokens })
    },
    discovery: {
      mode: catalog.discovery.mode,
      discoverable: catalog.discovery.discoverable,
      source: catalog.discovery.source,
      error: catalog.discovery.error
    }
  };
}

export function toChatRunLinkSummaryDto(input: {
  run_id: string | null;
  review_url: string | null;
  task_url: string | null;
  task_id: string | null;
  touched_files: string[];
  status: RequestRunStatus | 'failed_preflight';
}): ChatRunLinkSummaryDto {
  return {
    run_url: input.run_id === null ? null : `/api/runs/${encodeURIComponent(input.run_id)}`,
    review_url: input.review_url,
    task_url: input.task_url,
    task_id: input.task_id,
    touched_files: [...input.touched_files],
    status: input.status
  };
}

export function toAcceptedChatRunResponseDto(input: {
  runId: string;
  session_id: string;
  intent: string;
  status: RequestRunStatus;
  result_summary: string;
  touched_files: string[];
  plan: string[];
  event_count: number;
}): ChatRunAcceptedResponseDto {
  return {
    ok: true,
    accepted: true,
    runId: input.runId,
    run_id: input.runId,
    session_id: input.session_id,
    intent: input.intent,
    status: input.status,
    result_summary: input.result_summary,
    touched_files: [...input.touched_files],
    plan: [...input.plan],
    event_count: input.event_count,
    run_url: `/api/runs/${encodeURIComponent(input.runId)}`,
    review_url: null,
    task_url: null,
    task_id: null
  };
}

export function toCompletedChatRunResponseDto(input: {
  run_id: string;
  state: RequestRunState;
  links: ChatRunLinkSummaryDto;
}): ChatRunCompletedResponseDto {
  return {
    ok: true,
    runId: input.run_id,
    run_id: input.run_id,
    session_id: input.state.request_run.session_id,
    intent: input.state.request_run.intent,
    plan: [...input.state.request_run.plan],
    result_summary: input.state.request_run.result_summary,
    tool_outcomes: input.state.tool_outcomes.map((outcome) => ({
      order: outcome.order,
      tool_name: outcome.toolName,
      summary: outcome.summary,
      touched_files: [...(outcome.touchedFiles ?? [])],
      needs_review: outcome.needsReview ?? false,
      review_reasons: [...(outcome.reviewReasons ?? [])]
    })),
    ...input.links
  };
}

export function toFailedChatRunResponseDto(input: {
  code: 'missing_api_key' | 'runtime_error';
  error: string;
  run_id: string | null;
  session_id?: string | null;
  links: ChatRunLinkSummaryDto;
  result_summary: string;
  config_hint: string;
  settings_url: string;
  model?: string;
  provider?: string;
  base_url?: string;
  missing_api_key_env?: string;
}): ChatRunFailedResponseDto {
  return {
    ok: false,
    code: input.code,
    error: input.error,
    run_id: input.run_id,
    ...(input.session_id === undefined ? {} : { session_id: input.session_id }),
    ...input.links,
    result_summary: input.result_summary,
    config_hint: input.config_hint,
    settings_url: input.settings_url,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(input.base_url === undefined ? {} : { base_url: input.base_url }),
    ...(input.missing_api_key_env === undefined ? {} : { missing_api_key_env: input.missing_api_key_env })
  };
}

export function toChatSessionSummaryDto(input: ChatSessionSummaryDto): ChatSessionSummaryDto {
  return {
    ...input
  };
}

export function toChatSessionDetailDto(input: ChatSessionDetailDto): ChatSessionDetailDto {
  return {
    session: toChatSessionSummaryDto(input.session),
    runs: input.runs.map((run) => ({ ...run }))
  };
}

export function toChatRunUiStateDto(input: ChatRunUiStateDto): ChatRunUiStateDto {
  return {
    ui_state: input.ui_state,
    actions: input.actions.map((action): ChatActionDto => ({ ...action }))
  };
}

function toChatModelCatalogEntryDto(entry: ChatModelCatalogEntryDto): ChatModelCatalogEntryDto {
  return {
    ...entry
  };
}

function toProjectEnvDescriptorDto(input: { keys: string[] }): ProjectEnvDescriptorDto {
  return {
    source: 'project_root_env',
    keys: [...input.keys]
  };
}

function toProjectEnvEditorDto(input: { keys: string[]; contents: string }): ProjectEnvEditorDto {
  return {
    ...toProjectEnvDescriptorDto({ keys: input.keys }),
    contents: input.contents
  };
}
