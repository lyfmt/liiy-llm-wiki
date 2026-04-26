export interface DiscoveryItem {
  kind: 'source' | 'entity' | 'taxonomy' | 'topic' | 'query';
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  updated_at: string;
  path: string;
  source_ref_count: number;
  links: {
    app: string;
    api: string;
  };
}

export interface DiscoverySection {
  kind: DiscoveryItem['kind'];
  title: string;
  description: string;
  count: number;
  items: DiscoveryItem[];
}

export interface DiscoveryResponse {
  index_markdown: string;
  totals: {
    sources: number;
    entities: number;
    taxonomy: number;
    topics: number;
    queries: number;
  };
  sections: DiscoverySection[];
}

export interface KnowledgePageResponse {
  page: {
    kind: DiscoveryItem['kind'];
    slug: string;
    path: string;
    title: string;
    summary: string;
    aliases: string[];
    tags: string[];
    status: string;
    updated_at: string;
    body: string;
  };
  navigation: {
    taxonomy: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
    sections: Array<{
      id: string;
      title: string;
      summary: string;
      grounding: {
        source_paths: string[];
        locators: string[];
        anchor_count: number;
      };
    }>;
    entities: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
    assertions: Array<{
      id: string;
      title: string;
      statement: string;
      evidence_count: number;
    }>;
    source_refs: Array<{
      path: string;
      manifest_id: string | null;
      manifest_title: string | null;
      links: {
        app: string | null;
        api: string | null;
      };
    }>;
    outgoing_links: Array<{
      target: string;
      is_local_wiki_page: boolean;
      links: {
        app: string | null;
        api: string | null;
      };
    }>;
    backlinks: Array<{
      kind: DiscoveryItem['kind'];
      slug: string;
      title: string;
      summary: string;
      path: string;
      links: {
        app: string;
        api: string;
      };
    }>;
    related_by_source: Array<{
      kind: DiscoveryItem['kind'];
      slug: string;
      title: string;
      summary: string;
      path: string;
      shared_source_refs: string[];
      links: {
        app: string;
        api: string;
      };
    }>;
  };
}

export type KnowledgeNavigationNodeKind =
  | 'taxonomy'
  | 'topic'
  | 'section_group'
  | 'entity_group'
  | 'concept_group'
  | 'section'
  | 'entity'
  | 'concept';

export type KnowledgeGraphRelatedTargetKind = 'topic' | 'section' | 'entity' | 'concept' | 'evidence';

export interface KnowledgeGraphRelatedLink {
  edge_id: string;
  type: 'about' | 'grounded_by' | 'mentions' | 'part_of';
  direction: 'outgoing' | 'incoming';
  target: {
    id: string;
    kind: KnowledgeGraphRelatedTargetKind;
    title: string;
    summary: string;
    href: string | null;
  };
}

export interface KnowledgeNavigationNode {
  id: string;
  kind: KnowledgeNavigationNodeKind;
  title: string;
  summary: string;
  count: number;
  href: string | null;
  related: KnowledgeGraphRelatedLink[];
  children: KnowledgeNavigationNode[];
}

export interface KnowledgeNavigationResponse {
  roots: KnowledgeNavigationNode[];
}

export type RequestRunStatus = 'running' | 'needs_review' | 'done' | 'failed' | 'rejected';
export type TaskStatus = 'pending' | 'in_progress' | 'needs_review' | 'done';
export type ChatModelApi = 'anthropic-messages' | 'openai-completions' | 'openai-responses';

export interface ChatSettings {
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

export interface ProjectEnvDescriptor {
  source: 'project_root_env';
  keys: string[];
}

export interface ProjectEnvEditor extends ProjectEnvDescriptor {
  contents: string;
}

export interface RuntimeReadinessSummary {
  ready: boolean;
  status: 'ready' | 'missing_api_key' | 'missing_graph_database_url' | 'missing_api_key_and_graph_database_url';
  summary: string;
  issues: string[];
  settings_url: string;
  configured_api_key_env: string;
  project_env_has_configured_key: boolean;
  project_env_has_graph_database_url: boolean;
  model: string;
  provider: string;
  api: string;
  base_url: string;
  allow_query_writeback: boolean;
  allow_lint_autofix: boolean;
}

export interface RunSummary {
  run_id: string;
  session_id: string | null;
  status: RequestRunStatus;
  intent: string;
  result_summary: string;
  touched_files: string[];
  has_changeset: boolean;
  review_task_id: string | null;
}

export interface ChangeSet {
  target_files: string[];
  patch_summary: string;
  rationale: string;
  source_refs: string[];
  risk_level: string;
  needs_review: boolean;
}

export interface RunDetailToolOutcome {
  order: number;
  tool_name: string;
  summary: string;
  evidence: string[];
  touched_files: string[];
  change_set: ChangeSet | null;
  result_markdown: string | null;
  needs_review: boolean;
  review_reasons: string[];
  has_structured_data: boolean;
}

export interface RunDetailEvent {
  type: string;
  timestamp: string;
  summary: string;
  status: RequestRunStatus | null;
  tool_name: string | null;
  tool_call_id: string | null;
  evidence: string[];
  touched_files: string[];
  has_structured_data: boolean;
}

export interface RunTimelineItem {
  lane: 'user' | 'assistant' | 'tool' | 'system';
  title: string;
  summary: string;
  timestamp: string | null;
  meta: string | null;
}

export interface RunDetailResponse {
  request_run: {
    run_id: string;
    session_id: string | null;
    user_request: string;
    intent: string;
    plan: string[];
    status: RequestRunStatus;
    evidence: string[];
    touched_files: string[];
    decisions: string[];
    result_summary: string;
    attachments: Array<{
      attachment_id: string;
      file_name: string;
      mime_type: string;
      kind: 'image' | 'pdf' | 'text';
    }>;
  };
  tool_outcomes: RunDetailToolOutcome[];
  events: RunDetailEvent[];
  timeline_items: RunTimelineItem[];
  draft_markdown: string;
  result_markdown: string;
  changeset: ChangeSet | null;
}

export interface ChatOperationsSummary {
  settings: ChatSettings;
  project_env: ProjectEnvDescriptor;
  runtime_readiness: RuntimeReadinessSummary;
  recent_runs: RunSummary[];
  suggested_requests: string[];
}

export interface ChatSettingsResponse {
  settings: ChatSettings;
  project_env: ProjectEnvEditor;
}

export interface ChatSettingsUpdateResponse extends ChatSettingsResponse {
  ok: boolean;
}

export interface ChatModelCatalogEntry {
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

export interface ChatModelProvider {
  id: string;
  models: ChatModelCatalogEntry[];
}

export interface ChatModelsSelected {
  provider: string;
  model: string;
  api?: ChatModelApi;
  base_url?: string;
  api_key_env?: string;
  reasoning?: boolean;
  context_window?: number;
  max_tokens?: number;
}

export interface ChatModelsResponse {
  default_provider: string;
  providers: ChatModelProvider[];
  selected: ChatModelsSelected;
  discovery: {
    mode: 'catalog' | 'runtime';
    discoverable: boolean;
    source: 'builtin_catalog' | 'remote_probe';
    error: string | null;
  };
}

export interface ChatSettingsUpdateRequest {
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

export interface ChatRunLinkSummary {
  run_url: string | null;
  review_url: string | null;
  task_url: string | null;
  task_id: string | null;
  touched_files: string[];
  status: RequestRunStatus | 'failed_preflight';
}

export interface ChatRunAcceptedResponse extends ChatRunLinkSummary {
  ok: true;
  accepted: true;
  runId: string;
  run_id: string;
  session_id: string;
  intent: string;
  status: RequestRunStatus;
  result_summary: string;
  plan: string[];
  event_count: number;
}

export interface ChatRunCompletedResponse extends ChatRunLinkSummary {
  ok: true;
  runId: string;
  run_id: string;
  session_id: string | null;
  intent: string;
  plan: string[];
  result_summary: string;
  tool_outcomes: Array<{
    order: number;
    tool_name: string;
    summary: string;
    touched_files: string[];
    needs_review: boolean;
    review_reasons: string[];
  }>;
}

export interface ChatRunFailedResponse extends ChatRunLinkSummary {
  ok: false;
  code: 'missing_api_key' | 'runtime_error';
  error: string;
  config_hint: string;
  settings_url: string;
  run_id: string | null;
  session_id?: string | null;
  result_summary: string;
  model?: string;
  provider?: string;
  base_url?: string;
  missing_api_key_env?: string;
}

export interface ChatSessionSummary {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: 'idle' | 'running' | 'needs_review' | 'done' | 'failed';
  summary: string;
  last_run_id: string | null;
  run_count: number;
}

export interface ChatSessionDetail {
  session: ChatSessionSummary;
  runs: RunDetailResponse[];
}

export interface ChatRunUiState {
  ui_state: 'chat' | 'clarify' | 'confirm' | 'review' | 'done';
  actions: Array<{
    kind: 'reply' | 'clarify' | 'approve' | 'retry' | 'new_chat';
    label: string;
    prompt?: string;
  }>;
}

export type ChatRunStartResponse = ChatRunAcceptedResponse | ChatRunCompletedResponse | ChatRunFailedResponse;

export interface ChatAttachmentRef {
  attachment_id: string;
  file_name: string;
  mime_type: string;
  kind: 'image' | 'pdf' | 'text';
}

export interface ChatAttachmentUploadResponse {
  ok: true;
  session_id: string;
  attachment: ChatAttachmentRef;
  pipeline_run_id?: string;
  pipeline_status?: string;
  pipeline_source_id?: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  evidence: string[];
  assignee: string;
  created_at: string;
  updated_at: string;
  links: {
    api: string;
  };
}

export interface SourceSummary {
  id: string;
  title: string;
  type: string;
  status: 'inbox' | 'accepted' | 'rejected' | 'processed';
  raw_path: string;
  imported_at: string;
  tags: string[];
  has_notes: boolean;
  links: {
    api: string;
  };
}
