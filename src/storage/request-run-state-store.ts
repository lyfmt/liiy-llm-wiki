import path from 'node:path';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

import { type ChatAttachmentRef } from '../domain/chat-attachment.js';
import { createChangeSet, type ChangeSet } from '../domain/change-set.js';
import { createRequestRun, type RequestRun, type RequestRunStatus } from '../domain/request-run.js';
import type { PersistedRuntimeToolOutcome } from '../runtime/request-run-state.js';
import {
  buildRequestRunArtifactPaths,
  type RequestRunArtifactPaths
} from './request-run-artifact-paths.js';

export type RequestRunEventType =
  | 'run_started'
  | 'plan_available'
  | 'tool_started'
  | 'tool_finished'
  | 'evidence_added'
  | 'draft_updated'
  | 'run_completed'
  | 'run_failed';

export interface RequestRunEvent {
  type: RequestRunEventType;
  timestamp: string;
  summary: string;
  status?: RequestRunStatus;
  tool_name?: string;
  tool_call_id?: string;
  evidence?: string[];
  touched_files?: string[];
  data?: Record<string, unknown>;
}

export interface RequestRunTimelineItem {
  lane: 'user' | 'assistant' | 'tool' | 'system';
  title: string;
  summary: string;
  timestamp?: string;
  meta?: string;
}

export interface RequestRunState {
  request_run: RequestRun;
  tool_outcomes: PersistedRuntimeToolOutcome[];
  events?: RequestRunEvent[];
  timeline_items?: RequestRunTimelineItem[];
  draft_markdown: string;
  result_markdown: string;
  changeset: ChangeSet | null;
}

interface StoredRequestRecord {
  run_id: string;
  session_id: string | null;
  user_request: string;
  intent: string;
  attachments?: ChatAttachmentRef[];
}

interface StoredCheckpointRecord {
  status: RequestRunStatus;
  touched_files: string[];
  decisions: string[];
  result_summary: string;
}

export async function saveRequestRunState(
  root: string,
  state: RequestRunState
): Promise<RequestRunArtifactPaths> {
  const paths = buildRequestRunArtifactPaths(root, state.request_run.run_id);

  await mkdir(paths.runDirectory, { recursive: true });
  await writeJson(paths.request, {
    run_id: state.request_run.run_id,
    session_id: state.request_run.session_id,
    user_request: state.request_run.user_request,
    intent: state.request_run.intent,
    attachments: state.request_run.attachments
  });
  await writeJson(paths.plan, state.request_run.plan);
  await writeJson(paths.evidence, state.request_run.evidence);
  await writeJson(paths.toolOutcomes, state.tool_outcomes);
  await writeJson(paths.events, state.events ?? []);
  await writeJson(paths.timeline, state.timeline_items ?? []);
  await writeFile(paths.draft, state.draft_markdown, 'utf8');
  await writeJson(paths.changeset, state.changeset);
  await writeFile(paths.result, state.result_markdown, 'utf8');
  await writeJson(paths.checkpoint, {
    status: state.request_run.status,
    touched_files: state.request_run.touched_files,
    decisions: state.request_run.decisions,
    result_summary: state.request_run.result_summary
  });

  return paths;
}

export async function listRequestRunIds(root: string): Promise<string[]> {
  const paths = buildRequestRunArtifactPaths(root, 'placeholder-run-id');

  try {
    return (await readdir(path.dirname(paths.runDirectory), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function loadRequestRunState(root: string, runId: string): Promise<RequestRunState> {
  const paths = buildRequestRunArtifactPaths(root, runId);
  const checkpoint = assertStoredCheckpointRecord(
    await readRequiredJson<unknown>(paths.checkpoint, 'checkpoint.json'),
    'checkpoint.json'
  );
  const request = assertStoredRequestRecord(
    await readRequiredJson<unknown>(paths.request, 'request.json'),
    'request.json',
    runId
  );
  const plan = assertStringArray(await readRequiredJson<unknown>(paths.plan, 'plan.json'), 'plan.json');
  const evidence = assertStringArray(
    await readRequiredJson<unknown>(paths.evidence, 'evidence.json'),
    'evidence.json'
  );
  const tool_outcomes = assertStoredToolOutcomeArray(
    await readRequiredJson<unknown>(paths.toolOutcomes, 'tool-outcomes.json'),
    'tool-outcomes.json'
  );
  const events = assertStoredRunEventArray(
    await readOptionalJson<unknown>(paths.events, []),
    'events.json'
  );
  const timeline_items = assertStoredTimelineItemArray(
    await readOptionalJson<unknown>(paths.timeline, []),
    'timeline.json'
  );
  const draft_markdown = await readRequiredText(paths.draft, 'draft.md');
  const storedChangeSet = assertStoredChangeSet(
    await readRequiredJson<unknown>(paths.changeset, 'changeset.json'),
    'changeset.json'
  );
  const result_markdown = await readRequiredText(paths.result, 'result.md');

  return {
    request_run: createRequestRun({
      run_id: request.run_id,
      session_id: request.session_id,
      user_request: request.user_request,
      intent: request.intent,
      plan,
      status: checkpoint.status,
      evidence,
      touched_files: checkpoint.touched_files,
      decisions: checkpoint.decisions,
      result_summary: checkpoint.result_summary,
      attachments: request.attachments ?? []
    }),
    tool_outcomes,
    events,
    timeline_items,
    draft_markdown,
    result_markdown,
    changeset: storedChangeSet === null ? null : createChangeSet(storedChangeSet)
  };
}

function assertStoredRequestRecord(
  value: unknown,
  fileName: string,
  expectedRunId?: string
): StoredRequestRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.run_id !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (expectedRunId !== undefined && value.run_id !== expectedRunId) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (value.session_id !== undefined && value.session_id !== null && typeof value.session_id !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.user_request !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.intent !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  const attachments = value.attachments === undefined ? undefined : assertStoredChatAttachmentRefArray(value.attachments, fileName);

  return {
    run_id: value.run_id,
    session_id: value.session_id ?? null,
    user_request: value.user_request,
    intent: value.intent,
    ...(attachments === undefined ? {} : { attachments })
  };
}

function assertStoredCheckpointRecord(value: unknown, fileName: string): StoredCheckpointRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!['running', 'needs_review', 'done', 'failed', 'rejected'].includes(String(value.status))) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.touched_files) || value.touched_files.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.decisions) || value.decisions.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.result_summary !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return {
    status: value.status as RequestRunStatus,
    touched_files: value.touched_files,
    decisions: value.decisions,
    result_summary: value.result_summary
  };
}

function assertStoredChangeSet(value: unknown, fileName: string): ChangeSet | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.target_files) || value.target_files.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.patch_summary !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.rationale !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.source_refs) || value.source_refs.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.risk_level !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.needs_review !== 'boolean') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return {
    target_files: value.target_files,
    patch_summary: value.patch_summary,
    rationale: value.rationale,
    source_refs: value.source_refs,
    risk_level: value.risk_level,
    needs_review: value.needs_review
  };
}

function assertStoredToolOutcomeArray(value: unknown, fileName: string): PersistedRuntimeToolOutcome[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value.map((entry) => assertStoredToolOutcome(entry, fileName));
}

function assertStoredChatAttachmentRefArray(value: unknown, fileName: string): ChatAttachmentRef[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value.map((entry) => assertStoredChatAttachmentRef(entry, fileName));
}

function assertStoredChatAttachmentRef(value: unknown, fileName: string): ChatAttachmentRef {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (
    typeof value.attachment_id !== 'string'
    || typeof value.file_name !== 'string'
    || typeof value.mime_type !== 'string'
    || (value.kind !== 'image' && value.kind !== 'pdf' && value.kind !== 'text')
  ) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return {
    attachment_id: value.attachment_id,
    file_name: value.file_name,
    mime_type: value.mime_type,
    kind: value.kind
  };
}

function assertStoredToolOutcome(value: unknown, fileName: string): PersistedRuntimeToolOutcome {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.order !== 'number' || !Number.isInteger(value.order) || value.order <= 0) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.toolName !== 'string' || typeof value.summary !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  const evidence = value.evidence === undefined ? undefined : assertStringArray(value.evidence, fileName);
  const touchedFiles = value.touchedFiles === undefined ? undefined : assertStringArray(value.touchedFiles, fileName);
  const changeSet = value.changeSet === undefined ? undefined : assertStoredChangeSet(value.changeSet, fileName);
  const resultMarkdown = value.resultMarkdown === undefined ? undefined : assertString(value.resultMarkdown, fileName);
  const needsReview = value.needsReview === undefined ? undefined : assertBoolean(value.needsReview, fileName);
  const reviewReasons = value.reviewReasons === undefined ? undefined : assertStringArray(value.reviewReasons, fileName);
  const data = value.data === undefined ? undefined : assertRecordOfUnknown(value.data, fileName);

  return {
    order: value.order,
    toolName: value.toolName,
    summary: value.summary,
    ...(evidence === undefined ? {} : { evidence }),
    ...(touchedFiles === undefined ? {} : { touchedFiles }),
    ...(changeSet === undefined ? {} : { changeSet }),
    ...(resultMarkdown === undefined ? {} : { resultMarkdown }),
    ...(needsReview === undefined ? {} : { needsReview }),
    ...(reviewReasons === undefined ? {} : { reviewReasons }),
    ...(data === undefined ? {} : { data })
  };
}

function assertStoredRunEventArray(value: unknown, fileName: string): RequestRunEvent[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value.map((entry) => assertStoredRunEvent(entry, fileName));
}

function assertStoredRunEvent(value: unknown, fileName: string): RequestRunEvent {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!isRequestRunEventType(value.type)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.timestamp !== 'string' || typeof value.summary !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  const status = value.status === undefined ? undefined : assertRequestRunStatus(value.status, fileName);
  const tool_name = value.tool_name === undefined ? undefined : assertString(value.tool_name, fileName);
  const tool_call_id = value.tool_call_id === undefined ? undefined : assertString(value.tool_call_id, fileName);
  const evidence = value.evidence === undefined ? undefined : assertStringArray(value.evidence, fileName);
  const touched_files = value.touched_files === undefined ? undefined : assertStringArray(value.touched_files, fileName);
  const data = value.data === undefined ? undefined : assertRecordOfUnknown(value.data, fileName);

  return {
    type: value.type,
    timestamp: value.timestamp,
    summary: value.summary,
    ...(status === undefined ? {} : { status }),
    ...(tool_name === undefined ? {} : { tool_name }),
    ...(tool_call_id === undefined ? {} : { tool_call_id }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(touched_files === undefined ? {} : { touched_files }),
    ...(data === undefined ? {} : { data })
  };
}

function assertStoredTimelineItemArray(value: unknown, fileName: string): RequestRunTimelineItem[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value.map((entry) => assertStoredTimelineItem(entry, fileName));
}

function assertStoredTimelineItem(value: unknown, fileName: string): RequestRunTimelineItem {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!isTimelineLane(value.lane)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.title !== 'string' || typeof value.summary !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  const timestamp = value.timestamp === undefined ? undefined : assertString(value.timestamp, fileName);
  const meta = value.meta === undefined ? undefined : assertString(value.meta, fileName);

  return {
    lane: value.lane,
    title: value.title,
    summary: value.summary,
    ...(timestamp === undefined ? {} : { timestamp }),
    ...(meta === undefined ? {} : { meta })
  };
}

function isRequestRunEventType(value: unknown): value is RequestRunEventType {
  return value === 'run_started'
    || value === 'plan_available'
    || value === 'tool_started'
    || value === 'tool_finished'
    || value === 'evidence_added'
    || value === 'draft_updated'
    || value === 'run_completed'
    || value === 'run_failed';
}

function assertRequestRunStatus(value: unknown, fileName: string): RequestRunStatus {
  if (!['running', 'needs_review', 'done', 'failed', 'rejected'].includes(String(value))) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value as RequestRunStatus;
}

function isTimelineLane(value: unknown): value is RequestRunTimelineItem['lane'] {
  return value === 'user' || value === 'assistant' || value === 'tool' || value === 'system';
}

function assertStringArray(value: unknown, fileName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value;
}

function assertString(value: unknown, fileName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value;
}

function assertBoolean(value: unknown, fileName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value;
}

function assertRecordOfUnknown(value: unknown, fileName: string): Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readRequiredJson<T>(filePath: string, fileName: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Incomplete request run state: missing ${fileName}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid request run state: malformed ${fileName}`);
    }

    throw error;
  }
}

async function readOptionalJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid request run state: malformed ${path.basename(filePath)}`);
    }

    throw error;
  }
}

async function readRequiredText(filePath: string, fileName: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Incomplete request run state: missing ${fileName}`);
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
