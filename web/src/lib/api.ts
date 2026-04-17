import type {
  ChatOperationsSummary,
  ChatRunStartResponse,
  ChatRunUiState,
  ChatSessionDetail,
  ChatSessionSummary,
  ChatSettingsResponse,
  ChatSettingsUpdateRequest,
  ChatSettingsUpdateResponse,
  ChatModelsResponse,
  DiscoveryResponse,
  KnowledgePageResponse,
  RunDetailResponse,
  RunSummary,
  TaskSummary
} from './types';

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function sendJson<TResponse>(input: string, method: 'POST' | 'PUT', body: unknown): Promise<TResponse> {
  return fetchJson<TResponse>(input, {
    method,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

export function getDiscovery(): Promise<DiscoveryResponse> {
  return fetchJson<DiscoveryResponse>('/api/discovery');
}

export function getKnowledgePage(kind: string, slug: string): Promise<KnowledgePageResponse> {
  return fetchJson<KnowledgePageResponse>(`/api/pages/${kind}/${encodeURIComponent(slug)}`);
}

export function getChatOperations(): Promise<ChatOperationsSummary> {
  return fetchJson<ChatOperationsSummary>('/api/chat/operations');
}

export function getChatSettings(): Promise<ChatSettingsResponse> {
  return fetchJson<ChatSettingsResponse>('/api/chat/settings');
}

export function getChatModels(params?: {
  provider?: string;
  api?: 'anthropic-messages' | 'openai-completions' | 'openai-responses';
  base_url?: string;
  api_key_env?: string;
  discover?: boolean;
}): Promise<ChatModelsResponse> {
  const query = new URLSearchParams();
  if (params?.provider) query.set('provider', params.provider);
  if (params?.api) query.set('api', params.api);
  if (params?.base_url) query.set('base_url', params.base_url);
  if (params?.api_key_env) query.set('api_key_env', params.api_key_env);
  if (params?.discover) query.set('discover', '1');
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return fetchJson<ChatModelsResponse>(`/api/chat/models${suffix}`);
}

export function updateChatSettings(payload: ChatSettingsUpdateRequest): Promise<ChatSettingsUpdateResponse> {
  return sendJson<ChatSettingsUpdateResponse>('/api/chat/settings', 'PUT', payload);
}

function isChatRunStartResponse(value: unknown): value is ChatRunStartResponse {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'ok' in value &&
      'run_id' in value &&
      'result_summary' in value &&
      'status' in value
  );
}

export async function startChatRun(userRequest: string, sessionId?: string): Promise<ChatRunStartResponse> {
  const response = await fetch('/api/chat/runs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ userRequest, ...(sessionId ? { sessionId } : {}) })
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json();
    if (isChatRunStartResponse(payload)) {
      return payload;
    }
    throw new Error(`Unexpected chat run response: ${response.status}`);
  }

  const text = await response.text();
  throw new Error(text || `Request failed: ${response.status}`);
}

export function getRuns(): Promise<RunSummary[]> {
  return fetchJson<RunSummary[]>('/api/runs');
}

export function getRun(runId: string): Promise<RunDetailResponse> {
  return fetchJson<RunDetailResponse>(`/api/runs/${encodeURIComponent(runId)}`);
}

export function getChatSessions(): Promise<ChatSessionSummary[]> {
  return fetchJson<ChatSessionSummary[]>('/api/chat/sessions');
}

export function createChatSession(userRequest?: string): Promise<ChatSessionSummary> {
  return sendJson<ChatSessionSummary>('/api/chat/sessions', 'POST', { ...(userRequest ? { userRequest } : {}) });
}

export function getChatSession(sessionId: string): Promise<ChatSessionDetail> {
  return fetchJson<ChatSessionDetail>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`);
}

export function getChatRunUi(runId: string): Promise<ChatRunUiState> {
  return fetchJson<ChatRunUiState>(`/api/chat/run-ui/${encodeURIComponent(runId)}`);
}

export function getTasks(status?: string): Promise<TaskSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<TaskSummary[]>(`/api/tasks${query}`);
}
