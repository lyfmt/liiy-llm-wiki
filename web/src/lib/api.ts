import type {
  ChatOperationsSummary,
  ChatRunStartResponse,
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

export function getChatModels(): Promise<ChatModelsResponse> {
  return fetchJson<ChatModelsResponse>('/api/chat/models');
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

export async function startChatRun(userRequest: string): Promise<ChatRunStartResponse> {
  const response = await fetch('/api/chat/runs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ userRequest })
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

export function getTasks(status?: string): Promise<TaskSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<TaskSummary[]>(`/api/tasks${query}`);
}
