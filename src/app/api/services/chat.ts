import { buildReviewTaskId } from '../../../flows/review/sync-review-task.js';
import type { ChatSettings } from '../../../domain/chat-settings.js';
import { listRuntimeModelCatalog, resolveRuntimeModel } from '../../../runtime/resolve-runtime-model.js';
import { loadChatSettings } from '../../../storage/chat-settings-store.js';
import { loadProjectEnv } from '../../../storage/project-env-store.js';
import { loadRequestRunState } from '../../../storage/request-run-state-store.js';
import { loadKnowledgeTask } from '../../../storage/task-store.js';
import type {
  ChatModelsResponseDto,
  ChatOperationsSummaryDto,
  ChatRunFailedResponseDto,
  ChatRunLinkSummaryDto,
  RuntimeReadinessSummaryDto
} from '../dto/chat.js';
import {
  toChatModelsResponseDto,
  toChatOperationsSummaryDto,
  toChatRunLinkSummaryDto,
  toFailedChatRunResponseDto
} from '../mappers/chat.js';
import { listRunSummariesDto } from './run.js';

const suggestedRequests = [
  'Inspect the wiki for patch first, read relevant pages and source refs, then answer with evidence.',
  'Write back a durable patch first answer as a reusable query page after inspecting the wiki and evidence.',
  'Create a new wiki page for patch first using observed wiki context and source evidence, then apply the governed draft if it is well-grounded.',
  'Ingest raw/accepted/design.md into the wiki and report whether the change was applied or queued for review.'
] as const;

export async function buildChatModelsResponseDto(root: string): Promise<ChatModelsResponseDto> {
  const settings = await loadChatSettings(root);

  return toChatModelsResponseDto(listRuntimeModelCatalog(settings));
}

export async function buildChatOperationsSummaryDto(root: string): Promise<ChatOperationsSummaryDto> {
  const [settings, projectEnv, runs] = await Promise.all([loadChatSettings(root), loadProjectEnv(root), listRunSummariesDto(root)]);

  return toChatOperationsSummaryDto({
    settings,
    project_env: {
      keys: filterVisibleProjectEnvKeys(projectEnv.keys)
    },
    runtime_readiness: buildRuntimeReadinessSummaryDto(root, settings, projectEnv),
    recent_runs: runs.slice(-5).reverse(),
    suggested_requests: [...suggestedRequests]
  });
}

export function buildRuntimeReadinessSummaryDto(
  root: string,
  settings: Awaited<ReturnType<typeof loadChatSettings>>,
  projectEnv: Awaited<ReturnType<typeof loadProjectEnv>>
): RuntimeReadinessSummaryDto {
  const resolvedRuntimeModel = resolveRuntimeModel(settings, { root });
  const configuredApiKeyEnv = settings.api_key_env?.trim() || '_none_';
  const projectEnvHasConfiguredKey =
    configuredApiKeyEnv !== '_none_' && projectEnv.values[configuredApiKeyEnv] !== undefined && projectEnv.values[configuredApiKeyEnv] !== '';
  const missingApiKey = resolveMissingChatRunApiKey(settings, resolvedRuntimeModel);
  const issues = missingApiKey ? [`Project .env is missing ${missingApiKey.apiKeyEnv}.`] : [];

  return {
    ready: missingApiKey === null,
    status: missingApiKey ? 'missing_api_key' : 'ready',
    summary: missingApiKey
      ? `Runtime is blocked until ${missingApiKey.apiKeyEnv} is set in the project .env.`
      : 'Runtime is ready for web-launched agent requests.',
    issues,
    settings_url: '/api/chat/settings',
    configured_api_key_env: configuredApiKeyEnv,
    project_env_has_configured_key: projectEnvHasConfiguredKey,
    model: settings.model,
    provider: resolvedRuntimeModel.model.provider,
    api: resolvedRuntimeModel.model.api,
    base_url: resolvedRuntimeModel.model.baseUrl,
    allow_query_writeback: settings.allow_query_writeback,
    allow_lint_autofix: settings.allow_lint_autofix
  };
}

export function resolveMissingChatRunApiKey(
  settings: ChatSettings,
  resolvedRuntimeModel: ReturnType<typeof resolveRuntimeModel>
): { apiKeyEnv: string } | null {
  const configuredEnvName = settings.api_key_env?.trim();

  if (!configuredEnvName) {
    return null;
  }

  return resolvedRuntimeModel.getApiKey(resolvedRuntimeModel.model.provider) ? null : { apiKeyEnv: configuredEnvName };
}

export async function summarizeChatRunResponseDto(root: string, runId: string): Promise<ChatRunLinkSummaryDto> {
  try {
    const runState = await loadRequestRunState(root, runId);
    const reviewTaskId = (await loadKnowledgeTaskIfExists(root, buildReviewTaskId(runId))) ? buildReviewTaskId(runId) : null;

    return toChatRunLinkSummaryDto({
      run_id: runId,
      review_url: runState.changeset ? `/api/reviews/${encodeURIComponent(runId)}` : null,
      task_url: reviewTaskId ? `/api/tasks/${encodeURIComponent(reviewTaskId)}` : null,
      task_id: reviewTaskId,
      touched_files: runState.request_run.touched_files,
      status: runState.request_run.status
    });
  } catch {
    return toChatRunLinkSummaryDto({
      run_id: runId,
      review_url: null,
      task_url: null,
      task_id: null,
      touched_files: [],
      status: 'running'
    });
  }
}

export async function buildFailedChatRunResponseDto(root: string, runId: string, error: unknown): Promise<ChatRunFailedResponseDto> {
  const message = error instanceof Error ? error.message : String(error);

  try {
    const runState = await loadRequestRunState(root, runId);
    const reviewTaskId = (await loadKnowledgeTaskIfExists(root, buildReviewTaskId(runId))) ? buildReviewTaskId(runId) : null;

    return toFailedChatRunResponseDto({
      code: 'runtime_error',
      error: message,
      run_id: runId,
      links: toChatRunLinkSummaryDto({
        run_id: runId,
        review_url: runState.changeset ? `/api/reviews/${encodeURIComponent(runId)}` : null,
        task_url: reviewTaskId ? `/api/tasks/${encodeURIComponent(reviewTaskId)}` : null,
        task_id: reviewTaskId,
        touched_files: runState.request_run.touched_files,
        status: runState.request_run.status
      }),
      result_summary: runState.request_run.result_summary,
      config_hint: 'Inspect the saved failed run, then adjust Runtime Settings or project .env before retrying.',
      settings_url: '/api/chat/settings'
    });
  } catch {
    return toFailedChatRunResponseDto({
      code: 'runtime_error',
      error: message,
      run_id: runId,
      links: toChatRunLinkSummaryDto({
        run_id: runId,
        review_url: null,
        task_url: null,
        task_id: null,
        touched_files: [],
        status: 'failed'
      }),
      result_summary: message,
      config_hint: 'Inspect Runtime Settings and the project .env, then retry the request.',
      settings_url: '/api/chat/settings'
    });
  }
}

function filterVisibleProjectEnvKeys(keys: string[]): string[] {
  return [...keys];
}

async function loadKnowledgeTaskIfExists(root: string, taskId: string): Promise<Awaited<ReturnType<typeof loadKnowledgeTask>> | null> {
  try {
    return await loadKnowledgeTask(root, taskId);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === `Incomplete task state: missing ${taskId}.json`) {
      return null;
    }

    throw error;
  }
}
