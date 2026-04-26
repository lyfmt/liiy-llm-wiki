import { useState } from 'react';

import { FloatingAssistantButton, ShellContainer } from '@/components/layout/template-primitives';
import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { KnowledgeLevelView } from '@/features/knowledge/components/knowledge-level-view';
import { TaxonomyDrilldownSidebar } from '@/features/knowledge/components/taxonomy-drilldown-sidebar';
import { useKnowledgeNavigation } from '@/features/knowledge/hooks/use-knowledge-navigation';
import type { KnowledgeNavigationNode } from '@/lib/types';

export function KnowledgeBasePage() {
  const { data, error, loading } = useKnowledgeNavigation();
  const [path, setPath] = useState<KnowledgeNavigationNode[]>([]);
  const roots = data?.roots ?? [];

  return (
    <ShellContainer className="h-screen min-h-0 overflow-hidden bg-white">
      <div className="flex h-screen min-h-0">
        <TaxonomyDrilldownSidebar roots={roots} path={path} onPathChange={setPath} />

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="p-8">
              <LoadingState label="正在读取知识层级..." />
            </div>
          ) : null}

          {error ? (
            <div className="p-8">
              <ErrorState title="知识库读取失败" message={error} />
            </div>
          ) : null}

          {!loading && !error ? <KnowledgeLevelView roots={roots} path={path} onPathChange={setPath} /> : null}
        </div>
      </div>

      <FloatingAssistantButton />
    </ShellContainer>
  );
}
