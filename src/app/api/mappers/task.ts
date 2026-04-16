import type { TaskDetailDto, TaskSummaryDto, TaskUpsertResponseDto } from '../dto/task.js';
import type { KnowledgeTask } from '../../../domain/task.js';

export function toTaskSummaryDto(task: KnowledgeTask): TaskSummaryDto {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    evidence: [...task.evidence],
    assignee: task.assignee,
    created_at: task.created_at,
    updated_at: task.updated_at,
    links: buildTaskLinksDto(task.id)
  };
}

export function toTaskDetailDto(task: KnowledgeTask): TaskDetailDto {
  return {
    ...toTaskSummaryDto(task)
  };
}

export function toTaskSummaryListDto(tasks: KnowledgeTask[]): TaskSummaryDto[] {
  return tasks.map((task) => toTaskSummaryDto(task));
}

export function buildTaskUpsertResponseDto(task: KnowledgeTask): TaskUpsertResponseDto {
  return {
    ok: true,
    task: toTaskDetailDto(task)
  };
}

function buildTaskLinksDto(taskId: string): TaskSummaryDto['links'] {
  const encodedTaskId = encodeURIComponent(taskId);

  return {
    api: `/api/tasks/${encodedTaskId}`
  };
}
