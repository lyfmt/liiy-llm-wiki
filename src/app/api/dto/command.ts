import type { ChatModelApi } from '../../../domain/chat-settings.js';
import type { SourceManifestStatus } from '../../../domain/source-manifest.js';
import type { TaskStatus } from '../../../domain/task.js';

export interface KnowledgePageUpsertRequestDto {
  title: string;
  aliases: string[];
  summary?: string;
  tags?: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  updated_at: string;
  body: string;
  rationale?: string;
}

export interface SourceManifestUpsertRequestDto {
  path: string;
  title: string;
  type: string;
  status?: SourceManifestStatus;
  hash: string;
  imported_at: string;
  tags?: string[];
  notes?: string;
}

export interface ReviewDecisionRequestDto {
  decision: 'approve' | 'reject';
  reviewer?: string;
  note?: string;
}

export interface TaskUpsertRequestDto {
  title: string;
  description?: string;
  status?: TaskStatus;
  evidence?: string[];
  assignee?: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatSettingsUpdateRequestDto {
  model?: string;
  provider?: string;
  api?: ChatModelApi;
  base_url?: string;
  api_key_env?: string;
  project_env_contents?: string;
  reasoning?: boolean;
  context_window?: number;
  max_tokens?: number;
  allow_query_writeback?: boolean;
  allow_lint_autofix?: boolean;
}

export interface ChatRunStartRequestDto {
  userRequest: string;
  sessionId?: string;
  attachmentIds?: string[];
}

export interface ChatAttachmentUploadRequestDto {
  sessionId?: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}
