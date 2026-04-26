import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { AiChatPage } from '@/features/ai-chat/pages/ai-chat-page';
import { ConsolePage } from '@/features/console/pages/console-page';
import { DiscoveryPage } from '@/features/discovery/pages/discovery-page';
import { KnowledgeBasePage } from '@/features/discovery/pages/knowledge-base-page';
import { RawIndexPage } from '@/features/raw/pages/raw-index-page';
import { RawReadingPage } from '@/features/raw/pages/raw-reading-page';
import { ReadingPage } from '@/features/reading/pages/reading-page';

const router = createBrowserRouter([
  {
    path: '/app',
    element: <DiscoveryPage />
  },
  {
    path: '/app/discovery',
    element: <DiscoveryPage />
  },
  {
    path: '/app/kb',
    element: <KnowledgeBasePage />
  },
  {
    path: '/app/raw',
    element: <RawIndexPage />
  },
  {
    path: '/app/raw/:sourceId',
    element: <RawReadingPage />
  },
  {
    path: '/app/pages/:kind/*',
    element: <ReadingPage />
  },
  {
    path: '/app/console',
    element: <ConsolePage />
  },
  {
    path: '/app/ai-chat',
    element: <AiChatPage />
  },
  {
    path: '*',
    element: <Navigate to="/app" replace />
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
