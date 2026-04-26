import { BookOpen, ChevronLeft, ChevronRight, FolderTree, Home, Layers3 } from 'lucide-react';

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
    <aside className="h-full w-[292px] shrink-0 overflow-hidden border-r border-[#D8EAF7] bg-[#EAF6FF]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-5 pb-4 pt-5">
          <a
            href="/app"
            className="inline-flex items-center gap-2 rounded-[8px] px-2 py-1 text-sm font-semibold text-[#5D7285] transition hover:bg-white/70 hover:text-[#17324A]"
          >
            <Home size={16} />
            Home
          </a>

          <div className="mt-7">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5D7285]">Knowledge</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#17324A]">知识库</h1>
            <p className="mt-2 text-sm leading-6 text-[#5D7285]">
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
                ? 'cursor-not-allowed bg-white/45 text-[#9FB2C1]'
                : 'bg-white text-[#315C7A] shadow-sm hover:bg-[#FDFEFF] hover:text-[#17324A]'
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
                  className="group flex w-full items-center gap-3 rounded-[8px] bg-white/72 px-3 py-3 text-left shadow-sm ring-1 ring-[#D8EAF7] transition hover:bg-white hover:ring-[#9ED8FF]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#DFF1FF] text-[#2479B5]">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#17324A]">{node.title}</span>
                    <span className="mt-0.5 block text-xs text-[#6D8292]">{kindLabels[node.kind]}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[#F5FBFF] px-2 py-1 text-xs font-semibold text-[#3A6D8E]">
                    {node.count}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-[#8BA6B8] transition group-hover:text-[#2479B5]" />
                </button>
              );
            })}
          </div>

          {currentLevel.length === 0 ? (
            <div className="rounded-[8px] bg-white/70 px-4 py-5 text-sm leading-6 text-[#6D8292]">
              当前层级暂无条目。
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
