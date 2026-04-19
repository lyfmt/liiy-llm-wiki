import { randomUUID } from 'node:crypto';

import {
  createChatSession,
  deriveChatSessionTitleFromUserRequest,
  type ChatAction,
  type ChatSession,
  type ChatUiState
} from '../../../domain/chat-session.js';
import type { RequestRunState } from '../../../storage/request-run-state-store.js';
import { listChatSessions, loadChatSession, saveChatSession } from '../../../storage/chat-session-store.js';
import { buildUserMessageWithAttachments } from '../../../runtime/chat-attachment-content.js';
import type { RuntimeConversationMessage } from '../../../runtime/chat-message-content.js';
import { listRunSummariesDto, loadRunDetailResponseDto } from './run.js';

export async function createChatSessionForRequest(root: string, userRequest: string): Promise<ChatSession> {
  const session = createChatSession({
    session_id: randomUUID(),
    title: deriveChatSessionTitleFromUserRequest(userRequest),
    summary: userRequest.trim(),
    status: 'idle'
  });
  await saveChatSession(root, session);
  return session;
}

export async function ensureChatSession(root: string, userRequest: string, sessionId?: string): Promise<ChatSession> {
  if (sessionId) {
    return loadChatSession(root, sessionId);
  }

  return createChatSessionForRequest(root, userRequest);
}

export async function recordRunInChatSession(root: string, input: {
  session: ChatSession;
  runId: string;
  status: ChatSession['status'];
  summary: string;
}): Promise<ChatSession> {
  const runIds = input.session.run_ids.includes(input.runId) ? input.session.run_ids : [...input.session.run_ids, input.runId];
  const updated = createChatSession({
    ...input.session,
    updated_at: new Date().toISOString(),
    last_run_id: input.runId,
    run_ids: runIds,
    summary: input.summary,
    status: input.status
  });
  await saveChatSession(root, updated);
  return updated;
}

export async function listChatSessionSummariesDto(root: string) {
  const sessions = await listChatSessions(root);
  return sessions.map((session) => ({
    session_id: session.session_id,
    title: session.title,
    updated_at: session.updated_at,
    created_at: session.created_at,
    status: session.status,
    summary: session.summary,
    last_run_id: session.last_run_id,
    run_count: session.run_ids.length
  }));
}

export async function loadChatSessionDetailDto(root: string, sessionId: string) {
  const session = await loadChatSession(root, sessionId);
  const runs = (await Promise.all(session.run_ids.map((runId) => loadRunDetailResponseDtoIfExists(root, runId))))
    .filter((run): run is Awaited<ReturnType<typeof loadRunDetailResponseDto>> => run !== null);
  const latestRunId = runs.some((run) => run.request_run.run_id === session.last_run_id)
    ? session.last_run_id
    : runs[runs.length - 1]?.request_run.run_id ?? null;

  return {
    session: {
      session_id: session.session_id,
      title: session.title,
      updated_at: session.updated_at,
      created_at: session.created_at,
      status: session.status,
      summary: session.summary,
      last_run_id: latestRunId,
      run_count: runs.length
    },
    runs
  };
}

export async function buildChatConversationHistory(root: string, sessionId: string): Promise<RuntimeConversationMessage[]> {
  const session = await loadChatSession(root, sessionId);
  const history: RuntimeConversationMessage[] = [];

  for (const runId of session.run_ids.slice(-6)) {
    const run = await loadRunDetailResponseDtoIfExists(root, runId);

    if (run === null) {
      continue;
    }

    history.push(
      await buildUserMessageWithAttachments(root, run.request_run.user_request, run.request_run.attachments)
    );
    if (run.request_run.result_summary.trim()) {
      history.push({ role: 'assistant', content: run.request_run.result_summary });
    }
  }

  return history;
}

export function deriveChatUiState(state: RequestRunState): ChatUiState {
  if (state.request_run.status === 'needs_review' || state.changeset?.needs_review) {
    return 'review';
  }

  if (state.request_run.status === 'running') {
    return 'confirm';
  }

  if (state.request_run.status === 'failed') {
    return 'clarify';
  }

  if ((state.request_run.intent === 'query' || state.request_run.intent === 'general') && state.request_run.status === 'done') {
    return 'chat';
  }

  return 'done';
}

export function deriveChatActions(state: RequestRunState): ChatAction[] {
  const uiState = deriveChatUiState(state);

  switch (uiState) {
    case 'review':
      return [
        { kind: 'approve', label: 'Approve write', prompt: 'Approve the proposed write and continue.' },
        { kind: 'reply', label: 'Ask for revision', prompt: 'Revise the proposed change with safer evidence and explain the revision.' }
      ];
    case 'clarify':
      return [
        { kind: 'clarify', label: 'Clarify request', prompt: 'Ask only for the specific missing detail that blocks you.' },
        { kind: 'retry', label: 'Retry', prompt: 'Retry with a different evidence path.' }
      ];
    case 'chat':
      return [{ kind: 'reply', label: 'Reply', prompt: 'Continue the conversation naturally.' }];
    case 'confirm':
      return [{ kind: 'reply', label: 'Continue', prompt: 'Proceed with the proposed action.' }];
    case 'done':
    default:
      return [{ kind: 'new_chat', label: 'New chat' }];
  }
}

export async function buildChatSidebarSummaryDto(root: string) {
  const [sessions, runs] = await Promise.all([listChatSessionSummariesDto(root), listRunSummariesDto(root)]);
  return {
    sessions,
    recent_runs: runs.slice(0, 10)
  };
}

async function loadRunDetailResponseDtoIfExists(
  root: string,
  runId: string
): Promise<Awaited<ReturnType<typeof loadRunDetailResponseDto>> | null> {
  try {
    return await loadRunDetailResponseDto(root, runId);
  } catch (error: unknown) {
    if (
      error instanceof Error
      && (
        error.message.startsWith('Incomplete request run state: missing ')
        || error.message.startsWith('Invalid request run state: ')
      )
    ) {
      return null;
    }

    throw error;
  }
}
