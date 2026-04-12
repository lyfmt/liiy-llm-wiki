import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import { createChangeSet, type ChangeSet } from '../domain/change-set.js';
import { createRequestRun, type RequestRun, type RequestRunStatus } from '../domain/request-run.js';
import {
  buildRequestRunArtifactPaths,
  type RequestRunArtifactPaths
} from './request-run-artifact-paths.js';

export interface RequestRunState {
  request_run: RequestRun;
  draft_markdown: string;
  result_markdown: string;
  changeset: ChangeSet | null;
}

interface StoredRequestRecord {
  run_id: string;
  user_request: string;
  intent: string;
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
  await rm(paths.checkpoint, { force: true });
  await writeJson(paths.request, {
    run_id: state.request_run.run_id,
    user_request: state.request_run.user_request,
    intent: state.request_run.intent
  });
  await writeJson(paths.plan, state.request_run.plan);
  await writeJson(paths.evidence, state.request_run.evidence);
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
  const draft_markdown = await readRequiredText(paths.draft, 'draft.md');
  const storedChangeSet = assertStoredChangeSet(
    await readRequiredJson<unknown>(paths.changeset, 'changeset.json'),
    'changeset.json'
  );
  const result_markdown = await readRequiredText(paths.result, 'result.md');

  return {
    request_run: createRequestRun({
      run_id: request.run_id,
      user_request: request.user_request,
      intent: request.intent,
      plan,
      status: checkpoint.status,
      evidence,
      touched_files: checkpoint.touched_files,
      decisions: checkpoint.decisions,
      result_summary: checkpoint.result_summary
    }),
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

  if (typeof value.user_request !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (typeof value.intent !== 'string') {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  return {
    run_id: value.run_id,
    user_request: value.user_request,
    intent: value.intent
  };
}

function assertStoredCheckpointRecord(value: unknown, fileName: string): StoredCheckpointRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid request run state: invalid ${fileName}`);
  }

  if (!['running', 'needs_review', 'done', 'failed'].includes(String(value.status))) {
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

function assertStringArray(value: unknown, fileName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
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
