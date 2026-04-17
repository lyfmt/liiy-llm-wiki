import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';
import { createChatSession, type ChatSession } from '../domain/chat-session.js';

export async function saveChatSession(root: string, session: ChatSession): Promise<string> {
  const filePath = buildChatSessionPath(root, session.session_id);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function loadChatSession(root: string, sessionId: string): Promise<ChatSession> {
  return createChatSession(assertChatSessionRecord(await readRequiredJson(buildChatSessionPath(root, sessionId), `${sessionId}.json`), `${sessionId}.json`));
}

export async function listChatSessions(root: string): Promise<ChatSession[]> {
  const { stateChatSessions } = buildProjectPaths(root);

  let entries: string[];
  try {
    entries = await readdir(stateChatSessions);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const sessions = await Promise.all(
    entries
      .filter((value) => value.endsWith('.json'))
      .sort()
      .map((entry) => loadChatSession(root, entry.slice(0, -'.json'.length)))
  );

  return sessions.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function buildChatSessionPath(root: string, sessionId: string): string {
  assertValidSessionId(sessionId);
  return path.join(buildProjectPaths(root).stateChatSessions, `${sessionId}.json`);
}

function assertValidSessionId(sessionId: string): void {
  if (
    sessionId.length === 0 ||
    sessionId === '.' ||
    sessionId === '..' ||
    sessionId !== path.basename(sessionId) ||
    sessionId.includes('/') ||
    sessionId.includes('\\')
  ) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
}

function assertChatSessionRecord(
  value: unknown,
  fileName: string
): {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_run_id: string | null;
  run_ids: string[];
  summary: string;
  status: ChatSession['status'];
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid chat session state: invalid ${fileName}`);
  }

  if (typeof value.session_id !== 'string' || typeof value.title !== 'string') {
    throw new Error(`Invalid chat session state: invalid ${fileName}`);
  }

  if (typeof value.created_at !== 'string' || typeof value.updated_at !== 'string') {
    throw new Error(`Invalid chat session state: invalid ${fileName}`);
  }

  if (value.last_run_id !== null && value.last_run_id !== undefined && typeof value.last_run_id !== 'string') {
    throw new Error(`Invalid chat session state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.run_ids) || value.run_ids.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid chat session state: invalid ${fileName}`);
  }

  if (typeof value.summary !== 'string') {
    throw new Error(`Invalid chat session state: invalid ${fileName}`);
  }

  if (!['idle', 'running', 'needs_review', 'done', 'failed'].includes(String(value.status))) {
    throw new Error(`Invalid chat session state: invalid ${fileName}`);
  }

  return {
    session_id: value.session_id,
    title: value.title,
    created_at: value.created_at,
    updated_at: value.updated_at,
    last_run_id: value.last_run_id ?? null,
    run_ids: value.run_ids,
    summary: value.summary,
    status: value.status as ChatSession['status']
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readRequiredJson(filePath: string, fileName: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Incomplete chat session state: missing ${fileName}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid chat session state: malformed ${fileName}`);
    }

    throw error;
  }
}
