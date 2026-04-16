import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildProjectPaths } from '../config/project-paths.js';
import { createKnowledgeTask, type KnowledgeTask, type TaskStatus } from '../domain/task.js';

export async function saveKnowledgeTask(root: string, task: KnowledgeTask): Promise<string> {
  const filePath = buildTaskPath(root, task.id);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(task, null, 2)}\n`, 'utf8');

  return filePath;
}

export async function loadKnowledgeTask(root: string, taskId: string): Promise<KnowledgeTask> {
  return createKnowledgeTask(assertTaskRecord(await readRequiredJson(buildTaskPath(root, taskId), `${taskId}.json`), `${taskId}.json`));
}

export async function listKnowledgeTasks(root: string, status?: TaskStatus): Promise<KnowledgeTask[]> {
  const { stateTasks } = buildProjectPaths(root);

  let entries: string[];

  try {
    entries = await readdir(stateTasks);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const tasks: KnowledgeTask[] = [];

  for (const entry of entries.filter((value) => value.endsWith('.json')).sort()) {
    const task = await loadKnowledgeTask(root, entry.slice(0, -'.json'.length));

    if (!status || task.status === status) {
      tasks.push(task);
    }
  }

  return tasks;
}

function buildTaskPath(root: string, taskId: string): string {
  assertValidTaskId(taskId);
  return path.join(buildProjectPaths(root).stateTasks, `${taskId}.json`);
}

function assertValidTaskId(taskId: string): void {
  if (
    taskId.length === 0 ||
    taskId === '.' ||
    taskId === '..' ||
    taskId !== path.basename(taskId) ||
    taskId.includes('/') ||
    taskId.includes('\\')
  ) {
    throw new Error(`Invalid task id: ${taskId}`);
  }
}

function assertTaskRecord(
  value: unknown,
  fileName: string
): {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  evidence: string[];
  assignee: string;
  created_at: string;
  updated_at: string;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  if (typeof value.id !== 'string') {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  if (typeof value.title !== 'string') {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  if (typeof value.description !== 'string') {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  if (!['pending', 'in_progress', 'needs_review', 'done'].includes(String(value.status))) {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  if (!Array.isArray(value.evidence) || value.evidence.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  if (typeof value.assignee !== 'string') {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  if (typeof value.created_at !== 'string' || typeof value.updated_at !== 'string') {
    throw new Error(`Invalid task state: invalid ${fileName}`);
  }

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    status: value.status as TaskStatus,
    evidence: value.evidence,
    assignee: value.assignee,
    created_at: value.created_at,
    updated_at: value.updated_at
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
      throw new Error(`Incomplete task state: missing ${fileName}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid task state: malformed ${fileName}`);
    }

    throw error;
  }
}
