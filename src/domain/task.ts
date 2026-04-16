export type TaskStatus = 'pending' | 'in_progress' | 'needs_review' | 'done';

export interface KnowledgeTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  evidence: string[];
  assignee: string;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeTaskInput {
  id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  evidence?: string[];
  assignee?: string;
  created_at: string;
  updated_at?: string;
}

export function createKnowledgeTask(input: CreateKnowledgeTaskInput): KnowledgeTask {
  return {
    id: input.id,
    title: input.title,
    description: input.description ?? '',
    status: input.status ?? 'pending',
    evidence: [...(input.evidence ?? [])],
    assignee: input.assignee ?? 'user',
    created_at: input.created_at,
    updated_at: input.updated_at ?? input.created_at
  };
}
