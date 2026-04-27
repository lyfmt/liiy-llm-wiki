import { BookOpen, ChevronLeft, ChevronRight, FolderTree, Home, Layers3, Settings } from 'lucide-react';

import type { KnowledgeNavigationNode } from '@/lib/types';
import { cn } from '@/lib/utils';

const kindLabels: Record<KnowledgeNavigationNode['kind'], string> = {
  taxonomy: 'Taxonomy',
  topic: 'Topic',
  section_group: 'Section',
  entity_group: 'Entity',
  concept_group: 'Concept',
  section: 'Section',
  entity: 'Entity',
  concept: 'Concept'
};

function getNodeIcon(kind: KnowledgeNavigationNode['kind']) {
  if (kind === 'taxonomy') return FolderTree;
  if (kind === 'topic') return BookOpen;
  return Layers3;
}

export function TaxonomyDrilldownSidebar({
  roots,
  path,
  onPathChange
}: {
  roots: KnowledgeNavigationNode[];
  path: KnowledgeNavigationNode[];
  onPathChange: (path: KnowledgeNavigationNode[]) => void;
}) {
  const current = path.at(-1) ?? null;
  const currentLevel = current?.children ?? roots;
  const parentPath = path.slice(0, -1);

  return (
    <aside className="h-full w-[292px] shrink-0 overflow-hidden border-r border-slate-200 bg-white">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-5 pb-4 pt-5">
          <a
            href="/app"
            className="inline-flex items-center gap-2 rounded-[8px] px-2 py-1 text-sm font-semibold text-brand transition hover:bg-blue-50 hover:text-blue-700"
          >
            <Home size={16} />
            Return Home
          </a>

          <div className="mt-7">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Knowledge Base</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">知识库</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {current ? current.title : '沿 taxonomy 逐层进入'}
            </p>
          </div>

          <button
            type="button"
            disabled={path.length === 0}
            onClick={() => onPathChange(parentPath)}
            className={cn(
              'mt-5 inline-flex h-9 items-center gap-2 rounded-[8px] px-3 text-sm font-semibold transition',
              path.length === 0
                ? 'cursor-not-allowed bg-slate-50 text-slate-300'
                : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-brand'
            )}
          >
            <ChevronLeft size={16} />
            返回上一级
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <div className="space-y-2">
            {currentLevel.map((node) => {
              const Icon = getNodeIcon(node.kind);
              const hasChildren = node.children.length > 0;

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    if (hasChildren) {
                      onPathChange([...path, node]);
                      return;
                    }

                    if (node.href) {
                      window.location.assign(node.href);
                      return;
                    }

                    onPathChange([...path, node]);
                  }}
                  className="group flex w-full items-center gap-3 rounded-[12px] border border-slate-100 bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/60 hover:shadow-sm"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-brand">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{node.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{kindLabels[node.kind]}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
                    {node.count}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:text-brand" />
                </button>
              );
            })}
          </div>

          {currentLevel.length === 0 ? (
            <div className="rounded-[12px] bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
              当前层级暂无条目。
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-4">
          <a href="/app/console" className="flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600">
            <Settings size={16} />
            Settings
          </a>
        </div>
      </div>
    </aside>
  );
}
