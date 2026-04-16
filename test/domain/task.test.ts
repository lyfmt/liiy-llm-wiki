import { describe, expect, it } from 'vitest';

import { createKnowledgeTask } from '../../src/domain/task.js';

describe('createKnowledgeTask', () => {
  it('creates a task with defaults', () => {
    const task = createKnowledgeTask({
      id: 'task-001',
      title: 'Review query page',
      created_at: '2026-04-13T00:00:00.000Z'
    });

    expect(task).toEqual({
      id: 'task-001',
      title: 'Review query page',
      description: '',
      status: 'pending',
      evidence: [],
      assignee: 'user',
      created_at: '2026-04-13T00:00:00.000Z',
      updated_at: '2026-04-13T00:00:00.000Z'
    });
  });
});
