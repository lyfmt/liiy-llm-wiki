import { randomUUID } from 'node:crypto';

import {
  toAcceptedChatRunResponseDto,
  toChatRunLinkSummaryDto,
  toChatRunUiStateDto,
  toChatSessionDetailDto,
  toChatSessionSummaryDto,
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
import {
  buildChatConversationHistory,
  createChatSessionForRequest,
  deriveChatActions,
  deriveChatUiState,
  ensureChatSession,
  listChatSessionSummariesDto,
  loadChatSessionDetailDto,
  recordRunInChatSession
} from '../services/chat-session.js';
import {
  parseChatAttachmentUploadRequestDto,
  parseChatRunStartRequestDto,
  parseChatSettingsUpdateRequestDto
} from '../services/command.js';
import type { ApiRouteContext } from '../route-context.js';
import { loadRequestRunStateIfExists, readJsonBody, writeJson } from '../route-helpers.js';
import { createChatSettings } from '../../../domain/chat-settings.js';
import type { ChatAttachmentRef } from '../../../domain/chat-attachment.js';
import { createRequestRun } from '../../../domain/request-run.js';
import { syncReviewTask } from '../../../flows/review/sync-review-task.js';
import { buildUserMessageWithAttachments } from '../../../runtime/chat-attachment-content.js';
import { buildIntentPlan, classifyIntent } from '../../../runtime/intent-classifier.js';
import { createRuntimeRunState } from '../../../runtime/request-run-state.js';
import type { RunRuntimeAgentResult } from '../../../runtime/agent-session.js';
import { resolveRuntimeModel } from '../../../runtime/resolve-runtime-model.js';
import { resolveChatAttachments, saveBufferedChatAttachment, toChatAttachmentRef } from '../../../storage/chat-attachment-store.js';
import { saveRequestRunState } from '../../../storage/request-run-state-store.js';
import { loadChatSettings, saveChatSettings } from '../../../storage/chat-settings-store.js';
import { loadProjectEnv, saveProjectEnv } from '../../../storage/project-env-store.js';

export async function handleChatRoutes(context: ApiRouteContext): Promise<boolean> {
  const { root, request, response, method, pathname, url, dependencies } = context;

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
    writeJson(
      response,
      200,
      await buildChatModelsResponseDto(root, {
        provider: typeof url.searchParams.get('provider') === 'string' ? (url.searchParams.get('provider') ?? undefined) : undefined,
        api:
          url.searchParams.get('api') === 'anthropic-messages' ||
          url.searchParams.get('api') === 'openai-completions' ||
          url.searchParams.get('api') === 'openai-responses'
            ? (url.searchParams.get('api') as 'anthropic-messages' | 'openai-completions' | 'openai-responses')
            : undefined,
        base_url: url.searchParams.get('base_url') ?? undefined,
        api_key_env: url.searchParams.get('api_key_env') ?? undefined,
        discover: url.searchParams.get('discover') === '1'
      })
    );
    return true;
  }

  if (method === 'GET' && pathname === '/api/chat/sessions') {
    writeJson(response, 200, (await listChatSessionSummariesDto(root)).map((session) => toChatSessionSummaryDto(session)));
    return true;
  }

  if (method === 'POST' && pathname === '/api/chat/sessions') {
    const payload = await readJsonBody(request);
    const userRequest = typeof payload.userRequest === 'string' ? payload.userRequest : 'New chat';
    const session = await createChatSessionForRequest(root, userRequest);
    writeJson(
      response,
      201,
      toChatSessionSummaryDto({
        session_id: session.session_id,
        title: session.title,
        created_at: session.created_at,
        updated_at: session.updated_at,
        status: session.status,
        summary: session.summary,
        last_run_id: session.last_run_id,
        run_count: session.run_ids.length
      })
    );
    return true;
  }

  if (method === 'POST' && pathname === '/api/chat/uploads') {
    const payload = parseChatAttachmentUploadRequestDto(await readJsonBody(request));
    const chatSession = payload.sessionId
      ? await ensureChatSession(root, payload.fileName, payload.sessionId)
      : await createChatSessionForRequest(root, payload.fileName);
    const attachment = await saveBufferedChatAttachment(root, {
      sessionId: chatSession.session_id,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      data: Buffer.from(payload.dataBase64, 'base64')
    });

    writeJson(response, 201, {
      ok: true,
      session_id: chatSession.session_id,
      attachment: toChatAttachmentRef(attachment)
    });
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/chat/sessions/')) {
    const sessionId = decodeURIComponent(pathname.slice('/api/chat/sessions/'.length));
    writeJson(response, 200, toChatSessionDetailDto(await loadChatSessionDetailDto(root, sessionId)));
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/chat/run-ui/')) {
    const runId = decodeURIComponent(pathname.slice('/api/chat/run-ui/'.length));
    const runState = await loadRequestRunStateIfExists(root, runId);
    if (runState === null) {
      writeJson(response, 404, { error: 'run_not_found' });
      return true;
    }
    writeJson(
      response,
      200,
      toChatRunUiStateDto({
        ui_state: deriveChatUiState(runState),
        actions: deriveChatActions(runState)
      })
    );
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
          session_id: payload.sessionId ?? null,
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

    const chatSession = await ensureChatSession(root, userRequest, payload.sessionId);
    const conversationHistory = await buildChatConversationHistory(root, chatSession.session_id);
    const attachments = (await resolveChatAttachments(root, payload.attachmentIds ?? [], chatSession.session_id)).map((attachment) =>
      toChatAttachmentRef(attachment)
    );
    const currentUserMessage = await buildUserMessageWithAttachments(root, userRequest, attachments);
    const runId = randomUUID();
    const intent = classifyIntent(userRequest);
    const plan = buildIntentPlan(intent);
    const acceptedState = createRuntimeRunState({
      runId,
      sessionId: chatSession.session_id,
      userRequest,
      intent,
      plan,
      toolOutcomes: [],
      assistantSummary: 'Run accepted. Waiting for model and tool activity.',
      status: 'running',
      attachments,
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

    await recordRunInChatSession(root, {
      session: chatSession,
      runId,
      status: 'running',
      summary: userRequest.trim()
    });

    const launchPromise = dependencies.runRuntimeAgent({
      root,
      userRequest,
      runId,
      sessionId: chatSession.session_id,
      conversationHistory,
      currentUserMessage,
      attachments,
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
      await persistResolvedChatRunIfStillRunning(root, runId, chatSession.session_id, userRequest, attachments, launchSnapshot.result);
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
      await persistFailedChatRunLaunch(root, runId, chatSession.session_id, userRequest, attachments, intent, plan, launchError);
      writeJson(response, 500, await buildFailedChatRunResponseDto(root, runId, launchError));
      return true;
    }

    void launchPromise.then(
      async (result) => {
        await persistResolvedChatRunIfStillRunning(root, runId, chatSession.session_id, userRequest, attachments, result);
      },
      async (error: unknown) => {
        await persistFailedChatRunLaunchIfStillRunning(root, runId, chatSession.session_id, userRequest, attachments, intent, plan, error);
      }
    );

    writeJson(
      response,
      202,
      toAcceptedChatRunResponseDto({
        runId,
        session_id: chatSession.session_id,
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
  sessionId: string,
  userRequest: string,
  attachments: ChatAttachmentRef[],
  result: RunRuntimeAgentResult
): Promise<void> {
  const existingRunState = await loadRequestRunStateIfExists(root, runId);

  if (existingRunState !== null && existingRunState.request_run.status !== 'running') {
    return;
  }

  const persistedState = createRuntimeRunState({
    runId,
    sessionId,
    userRequest,
    intent: result.intent,
    plan: result.plan,
    toolOutcomes: result.toolOutcomes,
    assistantSummary: result.assistantText,
    attachments
  });

  await saveRequestRunState(root, persistedState);
  await recordRunInChatSession(root, {
    session: await ensureChatSession(root, userRequest, sessionId),
    runId,
    status: persistedState.request_run.status === 'needs_review' ? 'needs_review' : persistedState.request_run.status === 'failed' ? 'failed' : 'done',
    summary: persistedState.request_run.result_summary
  });
  await syncReviewTask(root, persistedState);
}

async function persistFailedChatRunLaunchIfStillRunning(
  root: string,
  runId: string,
  sessionId: string,
  userRequest: string,
  attachments: ChatAttachmentRef[],
  intent: string,
  plan: string[],
  error: unknown
): Promise<void> {
  const existingRunState = await loadRequestRunStateIfExists(root, runId);

  if (existingRunState !== null && existingRunState.request_run.status !== 'running') {
    return;
  }

  await persistFailedChatRunLaunch(root, runId, sessionId, userRequest, attachments, intent, plan, error);
}

async function persistFailedChatRunLaunch(
  root: string,
  runId: string,
  sessionId: string,
  userRequest: string,
  attachments: ChatAttachmentRef[],
  intent: string,
  plan: string[],
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  const failedState: Awaited<ReturnType<typeof loadRequestRunStateIfExists>> extends infer T ? Exclude<T, null> : never = {
    request_run: createRequestRun({
      run_id: runId,
      session_id: sessionId,
      user_request: userRequest,
      intent,
      plan,
      status: 'failed',
      evidence: [],
      touched_files: [],
      decisions: [],
      result_summary: message,
      attachments
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
  };

  await saveRequestRunState(root, failedState);
  await recordRunInChatSession(root, {
    session: await ensureChatSession(root, userRequest, sessionId),
    runId,
    status: 'failed',
    summary: message
  });
}
