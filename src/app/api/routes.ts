import type { ApiRouteContext } from './route-context.js';
import { handleKnowledgeRoutes } from './routes/knowledge.js';
import { handleSourceRoutes } from './routes/sources.js';
import { handleRunRoutes } from './routes/runs.js';
import { handleTaskRoutes } from './routes/tasks.js';
import { handleChatRoutes } from './routes/chat.js';

export { type ApiRouteContext, type ApiRouteDependencies } from './route-context.js';

export async function handleApiRoute(context: ApiRouteContext): Promise<boolean> {
  if (await handleKnowledgeRoutes(context)) {
    return true;
  }

  if (await handleSourceRoutes(context)) {
    return true;
  }

  if (await handleRunRoutes(context)) {
    return true;
  }

  if (await handleTaskRoutes(context)) {
    return true;
  }

  if (await handleChatRoutes(context)) {
    return true;
  }

  return false;
}
