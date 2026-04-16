import { randomUUID } from 'node:crypto';

import {
  toAcceptedChatRunResponseDto,
  toChatRunLinkSummaryDto,
  toChatSettingsResponseDto,
  toChatSettingsUpdateResponseDto,
  toCompletedChatRunResponseDto,
  toFailedChatRunResponseDto
} from '../mappers/chat.js';
import {
  buildChatModelsResponseDto,
  buildChatOperationsSummaryDto,
  buildFailedChatRunResponseDto,
  resolveMissingChatRunApiKey,
  summarizeChatRunResponseDto
} from '../services/chat.js';
import { parseChatRunStartRequestDto, parseChatSettingsUpdateRequestDto } from '../services/command.js';
import type { ApiRouteContext } from '../route-context.js';
import { loadRequestRunStateIfExists, readJsonBody, writeJson } from '../route-helpers.js';
import { createChatSettings } from '../../../domain/chat-settings.js';
import { createRequestRun } from '../../../domain/request-run.js';
import { syncReviewTask } from '../../../flows/review/sync-review-task.js';
import { buildIntentPlan, classifyIntent } from '../../../runtime/intent-classifier.js';
import { createRuntimeRunState } from '../../../runtime/request-run-state.js';
import type { RunRuntimeAgentResult } from '../../../runtime/agent-session.js';
import { resolveRuntimeModel } from '../../../runtime/resolve-runtime-model.js';
import { saveRequestRunState } from '../../../storage/request-run-state-store.js';
import { loadChatSettings, saveChatSettings } from '../../../storage/chat-settings-store.js';
import { loadProjectEnv, saveProjectEnv } from '../../../storage/project-env-store.js';

export async function handleChatRoutes(context: ApiRouteContext): Promise<boolean> {
  const { root, request, response, method, pathname, dependencies } = context;

  if (method === 'GET' && pathname === '/api/chat/settings') {
    const [settings, projectEnv] = await Promise.all([loadChatSettings(root), loadProjectEnv(root)]);
    writeJson(
      response,
      200,
      toChatSettingsResponseDto({
        settings,
        project_env: {
          keys: [...projectEnv.keys],
          contents: projectEnv.contents
        }
      })
    );
    return true;
  }

  if (method === 'GET' && pathname === '/api/chat/operations') {
    writeJson(response, 200, await buildChatOperationsSummaryDto(root));
    return true;
  }

  if (method === 'GET' && pathname === '/api/chat/models') {
    writeJson(response, 200, await buildChatModelsResponseDto(root));
    return true;
  }

  if (method === 'PUT' && pathname === '/api/chat/settings') {
    const payload = parseChatSettingsUpdateRequestDto(await readJsonBody(request));
    const settings = createChatSettings({
      model: payload.model,
      provider: payload.provider,
      api: payload.api,
      base_url: payload.base_url,
      api_key_env: payload.api_key_env,
      reasoning: payload.reasoning,
      context_window: payload.context_window,
      max_tokens: payload.max_tokens,
      allow_query_writeback: payload.allow_query_writeback,
      allow_lint_autofix: payload.allow_lint_autofix
    });
    const existingProjectEnv = await loadProjectEnv(root);
    const projectEnvContents = Object.hasOwn(payload, 'project_env_contents')
      ? payload.project_env_contents ?? ''
      : existingProjectEnv.contents;
    await Promise.all([saveChatSettings(root, settings), saveProjectEnv(root, projectEnvContents)]);
    writeJson(
      response,
      200,
      toChatSettingsUpdateResponseDto({
        settings,
        project_env: {
          keys: [...existingProjectEnv.keys],
          contents: projectEnvContents
        }
      })
    );
    return true;
  }

  if (method === 'POST' && pathname === '/api/chat/runs') {
    const payload = parseChatRunStartRequestDto(await readJsonBody(request));
    const userRequest = payload.userRequest;
    const settings = await loadChatSettings(root);
    const resolvedRuntimeModel = resolveRuntimeModel(settings, { root });
    const missingApiKey = resolveMissingChatRunApiKey(settings, resolvedRuntimeModel);

    if (missingApiKey) {
      writeJson(
        response,
        400,
        toFailedChatRunResponseDto({
          code: 'missing_api_key',
          error: `Missing API key in project .env: ${missingApiKey.apiKeyEnv}`,
          run_id: null,
          links: toChatRunLinkSummaryDto({
            run_id: null,
            review_url: null,
            task_url: null,
            task_id: null,
            touched_files: [],
            status: 'failed_preflight'
          }),
          result_summary: `Missing API key in project .env: ${missingApiKey.apiKeyEnv}`,
          config_hint: `Set ${missingApiKey.apiKeyEnv}=... in the project .env or update Runtime Settings, then retry the request.`,
          settings_url: '/api/chat/settings',
          model: settings.model,
          provider: resolvedRuntimeModel.model.provider,
          base_url: resolvedRuntimeModel.model.baseUrl,
          missing_api_key_env: missingApiKey.apiKeyEnv
        })
      );
      return true;
    }

    const runId = randomUUID();
    const intent = classifyIntent(userRequest);
    const plan = buildIntentPlan(intent);
    const acceptedState = createRuntimeRunState({
      runId,
      userRequest,
      intent,
      plan,
      toolOutcomes: [],
      assistantSummary: 'Run accepted. Waiting for model and tool activity.',
      status: 'running',
      events: [
        {
          type: 'run_started',
          timestamp: new Date().toISOString(),
          summary: `Run accepted for ${intent} request`,
          status: 'running'
        },
        {
          type: 'plan_available',
          timestamp: new Date().toISOString(),
          summary: `Plan ready with ${plan.length} step${plan.length === 1 ? '' : 's'}`,
          status: 'running',
          data: { plan }
        }
      ]
    });

    await saveRequestRunState(root, acceptedState);

    const launchPromise = dependencies.runRuntimeAgent({
      root,
      userRequest,
      runId,
      model: resolvedRuntimeModel.model,
      getApiKey: resolvedRuntimeModel.getApiKey,
      allowQueryWriteback: settings.allow_query_writeback,
      allowLintAutoFix: settings.allow_lint_autofix
    });
    const launchSnapshot = await new Promise<
      | { type: 'resolved'; result: RunRuntimeAgentResult }
      | { type: 'rejected'; error: unknown }
      | { type: 'pending' }
    >((resolve) => {
      let completed = false;

      void launchPromise.then(
        (result) => {
          if (completed) {
            return;
          }

          completed = true;
          resolve({ type: 'resolved', result });
        },
        (error) => {
          if (completed) {
            return;
          }

          completed = true;
          resolve({ type: 'rejected', error });
        }
      );

      queueMicrotask(() => {
        if (completed) {
          return;
        }

        completed = true;
        resolve({ type: 'pending' });
      });
    });

    if (launchSnapshot.type === 'resolved') {
      await persistResolvedChatRunIfStillRunning(root, runId, userRequest, launchSnapshot.result);
      const [runState, runResponse] = await Promise.all([
        loadRequestRunStateIfExists(root, runId),
        summarizeChatRunResponseDto(root, runId)
      ]);

      if (runState === null) {
        throw new Error(`Missing persisted run state for completed chat run ${runId}`);
      }

      writeJson(
        response,
        200,
        toCompletedChatRunResponseDto({
          run_id: runId,
          state: runState,
          links: runResponse
        })
      );
      return true;
    }

    if (launchSnapshot.type === 'rejected') {
      const launchError = launchSnapshot.error;
      await persistFailedChatRunLaunch(root, runId, userRequest, intent, plan, launchError);
      writeJson(response, 500, await buildFailedChatRunResponseDto(root, runId, launchError));
      return true;
    }

    void launchPromise.then(
      async (result) => {
        await persistResolvedChatRunIfStillRunning(root, runId, userRequest, result);
      },
      async (error: unknown) => {
        await persistFailedChatRunLaunchIfStillRunning(root, runId, userRequest, intent, plan, error);
      }
    );

    writeJson(
      response,
      202,
      toAcceptedChatRunResponseDto({
        runId,
        intent: acceptedState.request_run.intent,
        status: acceptedState.request_run.status,
        result_summary: acceptedState.request_run.result_summary,
        touched_files: acceptedState.request_run.touched_files,
        plan: acceptedState.request_run.plan,
        event_count: Array.isArray(acceptedState.events) ? acceptedState.events.length : 0
      })
    );
    return true;
  }

  return false;
}

async function persistResolvedChatRunIfStillRunning(
  root: string,
  runId: string,
  userRequest: string,
  result: RunRuntimeAgentResult
): Promise<void> {
  const existingRunState = await loadRequestRunStateIfExists(root, runId);

  if (existingRunState !== null && existingRunState.request_run.status !== 'running') {
    return;
  }

  const persistedState = createRuntimeRunState({
    runId,
    userRequest,
    intent: result.intent,
    plan: result.plan,
    toolOutcomes: result.toolOutcomes,
    assistantSummary: result.assistantText
  });

  await saveRequestRunState(root, persistedState);
  await syncReviewTask(root, persistedState);
}

async function persistFailedChatRunLaunchIfStillRunning(
  root: string,
  runId: string,
  userRequest: string,
  intent: string,
  plan: string[],
  error: unknown
): Promise<void> {
  const existingRunState = await loadRequestRunStateIfExists(root, runId);

  if (existingRunState !== null && existingRunState.request_run.status !== 'running') {
    return;
  }

  await persistFailedChatRunLaunch(root, runId, userRequest, intent, plan, error);
}

async function persistFailedChatRunLaunch(
  root: string,
  runId: string,
  userRequest: string,
  intent: string,
  plan: string[],
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  await saveRequestRunState(root, {
    request_run: createRequestRun({
      run_id: runId,
      user_request: userRequest,
      intent,
      plan,
      status: 'failed',
      evidence: [],
      touched_files: [],
      decisions: [],
      result_summary: message
    }),
    tool_outcomes: [],
    events: [
      {
        type: 'run_started',
        timestamp: new Date().toISOString(),
        summary: `Run accepted for ${intent} request`,
        status: 'running'
      },
      {
        type: 'plan_available',
        timestamp: new Date().toISOString(),
        summary: `Plan ready with ${plan.length} step${plan.length === 1 ? '' : 's'}`,
        status: 'running',
        data: { plan }
      },
      {
        type: 'run_failed',
        timestamp: new Date().toISOString(),
        summary: message,
        status: 'failed'
      }
    ],
    draft_markdown: '# Runtime Draft\n\nRun failed before any tool activity.\n',
    result_markdown: `# Runtime Result\n\nFailed: ${message}\n`,
    changeset: null
  });
}
