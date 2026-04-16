import { buildWikiIndexResponseDto } from './api/mappers/wiki-index.js';
import { buildChatOperationsSummaryDto } from './api/services/chat.js';
import { listRunSummariesDto, listChangeSetSummariesDto } from './api/services/run.js';
import { buildTaskQueueSummary } from './task-queue.js';

import { listKnowledgeTasks } from '../storage/task-store.js';

export async function buildDashboardViewModel(root: string) {
  const [wikiIndex, tasks, runs, changesets, chatSummary] = await Promise.all([
    buildWikiIndexResponseDto(root),
    listKnowledgeTasks(root),
    listRunSummariesDto(root),
    listChangeSetSummariesDto(root),
    buildChatOperationsSummaryDto(root)
  ]);
  const taskQueue = buildTaskQueueSummary(tasks);

  return {
    wikiIndex,
    tasks,
    runs,
    changesets,
    chatSummary,
    taskQueue
  };
}
