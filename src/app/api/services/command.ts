import type {
  ChatRunStartRequestDto,
  ChatSettingsUpdateRequestDto,
  KnowledgePageUpsertRequestDto,
  ReviewDecisionRequestDto,
  SourceManifestUpsertRequestDto,
  TaskUpsertRequestDto
} from '../dto/command.js';

export function parseKnowledgePageUpsertRequestDto(value: Record<string, unknown>): KnowledgePageUpsertRequestDto {
  return {
    title: readString(value, 'title'),
    aliases: readStringArray(value, 'aliases'),
    summary: readOptionalStringField(value, 'summary'),
    tags: readOptionalStringArrayField(value, 'tags'),
    source_refs: readStringArray(value, 'source_refs'),
    outgoing_links: readStringArray(value, 'outgoing_links'),
    status: readString(value, 'status'),
    updated_at: readString(value, 'updated_at'),
    body: readString(value, 'body'),
    rationale: readOptionalStringField(value, 'rationale')
  };
}

export function parseSourceManifestUpsertRequestDto(value: Record<string, unknown>): SourceManifestUpsertRequestDto {
  return {
    path: readString(value, 'path'),
    title: readString(value, 'title'),
    type: readString(value, 'type'),
    status: readOptionalSourceStatus(value),
    hash: readString(value, 'hash'),
    imported_at: readString(value, 'imported_at'),
    tags: readOptionalStringArrayField(value, 'tags'),
    notes: readOptionalStringField(value, 'notes')
  };
}

export function parseReviewDecisionRequestDto(value: Record<string, unknown>): ReviewDecisionRequestDto {
  return {
    decision: assertReviewDecision(value.decision),
    reviewer: readOptionalStringField(value, 'reviewer'),
    note: readOptionalStringField(value, 'note')
  };
}

export function parseTaskUpsertRequestDto(value: Record<string, unknown>): TaskUpsertRequestDto {
  return {
    title: readString(value, 'title'),
    description: readOptionalStringField(value, 'description'),
    status: readOptionalTaskStatus(value),
    evidence: readOptionalStringArrayField(value, 'evidence'),
    assignee: readOptionalStringField(value, 'assignee'),
    created_at: readString(value, 'created_at'),
    updated_at: readOptionalStringField(value, 'updated_at')
  };
}

export function parseChatSettingsUpdateRequestDto(value: Record<string, unknown>): ChatSettingsUpdateRequestDto {
  return {
    model: readOptionalStringField(value, 'model'),
    provider: readOptionalStringField(value, 'provider'),
    api: readOptionalChatModelApi(value, 'api'),
    base_url: readOptionalStringField(value, 'base_url'),
    api_key_env: readOptionalStringField(value, 'api_key_env'),
    project_env_contents: readOptionalStringFieldAllowEmpty(value, 'project_env_contents'),
    reasoning: readOptionalBoolean(value, 'reasoning'),
    context_window: readOptionalPositiveInteger(value, 'context_window'),
    max_tokens: readOptionalPositiveInteger(value, 'max_tokens'),
    allow_query_writeback: readOptionalBoolean(value, 'allow_query_writeback'),
    allow_lint_autofix: readOptionalBoolean(value, 'allow_lint_autofix')
  };
}

export function parseChatRunStartRequestDto(value: Record<string, unknown>): ChatRunStartRequestDto {
  return {
    userRequest: readString(value, 'userRequest')
  };
}

function readString(value: Record<string, unknown>, key: string): string {
  if (typeof value[key] !== 'string') {
    throw new Error(`Invalid JSON body: expected string ${key}`);
  }

  return value[key] as string;
}

function readOptionalStringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];

  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== 'string') {
    throw new Error(`Invalid JSON body: expected string ${key}`);
  }

  return field;
}

function readOptionalStringFieldAllowEmpty(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];

  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== 'string') {
    throw new Error(`Invalid JSON body: expected string ${key}`);
  }

  return field;
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];

  if (!Array.isArray(field) || field.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid JSON body: expected string[] ${key}`);
  }

  return [...field];
}

function readOptionalStringArrayField(value: Record<string, unknown>, key: string): string[] | undefined {
  const field = value[key];

  if (field === undefined) {
    return undefined;
  }

  return readStringArray(value, key);
}

function readOptionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const field = value[key];

  if (field === undefined) {
    return undefined;
  }

  if (typeof field !== 'boolean') {
    throw new Error(`Invalid JSON body: expected boolean ${key}`);
  }

  return field;
}

function readOptionalPositiveInteger(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key];

  if (field === undefined || field === '') {
    return undefined;
  }

  if (typeof field !== 'number' || !Number.isInteger(field) || field <= 0) {
    throw new Error(`Invalid JSON body: expected positive integer ${key}`);
  }

  return field;
}

function readOptionalChatModelApi(value: Record<string, unknown>, key: string): 'anthropic-messages' | 'openai-completions' | 'openai-responses' | undefined {
  const field = value[key];

  if (field === undefined || field === '') {
    return undefined;
  }

  if (field === 'anthropic-messages' || field === 'openai-completions' || field === 'openai-responses') {
    return field;
  }

  throw new Error(`Invalid JSON body: expected chat model api ${key}`);
}

function readOptionalTaskStatus(value: Record<string, unknown>) {
  const field = value.status;

  if (field === undefined) {
    return undefined;
  }

  return assertTaskStatus(field);
}

function readOptionalSourceStatus(value: Record<string, unknown>) {
  const field = value.status;

  if (field === undefined) {
    return undefined;
  }

  if (field === 'inbox' || field === 'accepted' || field === 'rejected' || field === 'processed') {
    return field;
  }

  throw new Error('Invalid JSON body: expected source status');
}

function assertTaskStatus(value: unknown): 'pending' | 'in_progress' | 'needs_review' | 'done' {
  if (value === 'pending' || value === 'in_progress' || value === 'needs_review' || value === 'done') {
    return value;
  }

  throw new Error('Invalid JSON body: expected task status');
}

function assertReviewDecision(value: unknown): 'approve' | 'reject' {
  if (value === 'approve' || value === 'reject') {
    return value;
  }

  throw new Error('Invalid JSON body: expected review decision');
}
