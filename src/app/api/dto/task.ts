import type { TaskStatus } from '../../../domain/task.js';

export interface TaskLinksDto {
  api: string;
}

export interface TaskSummaryDto {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  evidence: string[];
  assignee: string;
  created_at: string;
  updated_at: string;
  links: TaskLinksDto;
}

export type TaskDetailDto = TaskSummaryDto;

export interface TaskUpsertResponseDto {
  ok: boolean;
  task: TaskDetailDto;
}
