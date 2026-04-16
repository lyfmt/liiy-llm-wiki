import { toTaskDetailDto, toTaskSummaryListDto, buildTaskUpsertResponseDto } from '../mappers/task.js';
import { parseTaskUpsertRequestDto } from '../services/command.js';
import type { ApiRouteContext } from '../route-context.js';
import { readJsonBody, writeJson } from '../route-helpers.js';
import { createKnowledgeTask } from '../../../domain/task.js';
import { listKnowledgeTasks, loadKnowledgeTask, saveKnowledgeTask } from '../../../storage/task-store.js';

export async function handleTaskRoutes(context: ApiRouteContext): Promise<boolean> {
  const { root, request, response, method, pathname, url } = context;

  if (method === 'GET' && pathname === '/api/tasks') {
    const status = url.searchParams.get('status') ?? undefined;
    const tasks = await listKnowledgeTasks(root, status === undefined ? undefined : context.assertTaskStatus(status));

    writeJson(response, 200, toTaskSummaryListDto(tasks));
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/tasks/')) {
    const taskId = decodeURIComponent(pathname.slice('/api/tasks/'.length));
    const task = await loadKnowledgeTask(root, taskId);

    writeJson(response, 200, toTaskDetailDto(task));
    return true;
  }

  if (method === 'PUT' && pathname.startsWith('/api/tasks/')) {
    const taskId = decodeURIComponent(pathname.slice('/api/tasks/'.length));
    const payload = parseTaskUpsertRequestDto(await readJsonBody(request));
    const task = createKnowledgeTask({
      id: taskId,
      title: payload.title,
      description: payload.description,
      status: payload.status,
      evidence: payload.evidence,
      assignee: payload.assignee || 'user',
      created_at: payload.created_at,
      updated_at: payload.updated_at || payload.created_at
    });
    await saveKnowledgeTask(root, task);
    writeJson(response, 200, buildTaskUpsertResponseDto(task));
    return true;
  }

  return false;
}
