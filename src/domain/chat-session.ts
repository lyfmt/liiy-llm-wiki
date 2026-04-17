export type ChatActionKind = 'reply' | 'clarify' | 'approve' | 'retry' | 'new_chat';

export type ChatUiState = 'chat' | 'clarify' | 'confirm' | 'review' | 'done';

export interface ChatAction {
  kind: ChatActionKind;
  label: string;
  prompt?: string;
}

export interface ChatSession {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_run_id: string | null;
  run_ids: string[];
  summary: string;
  status: 'idle' | 'running' | 'needs_review' | 'done' | 'failed';
}

export interface CreateChatSessionInput {
  session_id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
  last_run_id?: string | null;
  run_ids?: string[];
  summary?: string;
  status?: ChatSession['status'];
}

export function createChatSession(input: CreateChatSessionInput): ChatSession {
  const timestamp = input.created_at ?? input.updated_at ?? new Date().toISOString();

  return {
    session_id: input.session_id,
    title: normalizeTitle(input.title),
    created_at: input.created_at ?? timestamp,
    updated_at: input.updated_at ?? timestamp,
    last_run_id: input.last_run_id ?? null,
    run_ids: [...(input.run_ids ?? [])],
    summary: input.summary?.trim() ?? '',
    status: input.status ?? 'idle'
  };
}

export function deriveChatSessionTitleFromUserRequest(userRequest: string): string {
  const compact = userRequest
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return normalizeTitle(compact);
}

function normalizeTitle(value?: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : 'New chat';
}
