import { ArrowUpRight, BookOpen, FileText, GitBranch, Link2, Network, Rows3 } from 'lucide-react';

import type { KnowledgeGraphRelatedLink, KnowledgeNavigationNode } from '@/lib/types';

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

const relatedLabels: Record<KnowledgeGraphRelatedLink['type'], string> = {
  about: '相关陈述',
  grounded_by: '证据',
  mentions: '提到',
  part_of: '属于'
};

function getIntro(path: KnowledgeNavigationNode[]): { title: string; summary: string } {
  const current = path.at(-1);

  if (!current) {
    return {
      title: '知识库',
      summary: '从左侧第一层 taxonomy 开始，沿知识结构逐层进入。'
    };
  }

  return {
    title: current.title,
    summary: current.summary || `${kindLabels[current.kind]} 层级`
  };
}

export function KnowledgeLevelView({
  roots,
  path,
  onPathChange
}: {
  roots: KnowledgeNavigationNode[];
  path: KnowledgeNavigationNode[];
  onPathChange: (path: KnowledgeNavigationNode[]) => void;
}) {
  const current = path.at(-1) ?? null;
  const children = current?.children ?? roots;
  const intro = getIntro(path);
  const related = current?.related ?? [];

  return (
    <main className="min-h-0 flex-1 overflow-hidden bg-[#F7FCFF]">
      <div className="h-full overflow-y-auto px-8 py-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-[#6D8292]" aria-label="Breadcrumb">
            <button type="button" onClick={() => onPathChange([])} className="font-semibold text-[#2479B5] hover:text-[#17324A]">
              知识库
            </button>
            {path.map((node, index) => (
              <span key={node.id} className="flex items-center gap-2">
                <span className="text-[#A4B8C8]">/</span>
                <button
                  type="button"
                  onClick={() => onPathChange(path.slice(0, index + 1))}
                  className="max-w-[220px] truncate font-semibold text-[#315C7A] hover:text-[#17324A]"
                >
                  {node.title}
                </button>
              </span>
            ))}
          </nav>

          <section className="rounded-[8px] bg-white px-7 py-6 shadow-sm ring-1 ring-[#D8EAF7]">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#3BAAEF]">
                  <Network size={15} />
                  {current ? kindLabels[current.kind] : 'Taxonomy Root'}
                </p>
                <h2 className="mt-3 text-4xl font-semibold tracking-normal text-[#17324A]">{intro.title}</h2>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5D7285]">{intro.summary}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[8px] bg-[#EAF6FF] px-4 py-3">
                  <p className="text-xs font-semibold text-[#6D8292]">当前子项</p>
                  <p className="mt-1 text-2xl font-semibold text-[#17324A]">{children.length}</p>
                </div>
                <div className="rounded-[8px] bg-[#F0FAF6] px-4 py-3">
                  <p className="text-xs font-semibold text-[#6D8292]">Graph 链接</p>
                  <p className="mt-1 text-2xl font-semibold text-[#17324A]">{related.length}</p>
                </div>
              </div>
            </div>
          </section>

          {children.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#315C7A]">
                <Rows3 size={17} />
                当前层级
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {children.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onPathChange([...path, node])}
                    className="group rounded-[8px] bg-white p-5 text-left shadow-sm ring-1 ring-[#D8EAF7] transition hover:-translate-y-0.5 hover:ring-[#9ED8FF]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-full bg-[#EAF6FF] px-2.5 py-1 text-xs font-semibold text-[#2479B5]">
                        {kindLabels[node.kind]}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#F5FBFF] px-2.5 py-1 text-xs font-semibold text-[#6D8292]">
                        {node.count}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-[#17324A] group-hover:text-[#2479B5]">{node.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5D7285]">
                      {node.summary || '继续进入此层级查看结构化条目。'}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-[8px] bg-white px-6 py-8 text-center shadow-sm ring-1 ring-[#D8EAF7]">
              <BookOpen className="mx-auto text-[#9ED8FF]" size={34} />
              <h3 className="mt-3 text-lg font-semibold text-[#17324A]">当前节点没有下级条目</h3>
              {current?.href ? (
                <a
                  href={current.href}
                  className="mt-4 inline-flex items-center gap-2 rounded-[8px] bg-[#3BAAEF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2479B5]"
                >
                  打开阅读页
                  <ArrowUpRight size={16} />
                </a>
              ) : null}
            </section>
          )}

          {related.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#315C7A]">
                <GitBranch size={17} />
                相关 Graph 链接
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {related.map((link) => (
                  <RelatedLinkCard key={link.edge_id} link={link} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function RelatedLinkCard({ link }: { link: KnowledgeGraphRelatedLink }) {
  const content = (
    <span className="flex h-full items-start gap-4 rounded-[8px] bg-white p-4 shadow-sm ring-1 ring-[#D8EAF7] transition hover:ring-[#9ED8FF]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#EAF6FF] text-[#2479B5]">
        {link.target.kind === 'evidence' ? <FileText size={18} /> : <Link2 size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3BAAEF]">
          {relatedLabels[link.type]} · {link.target.kind}
        </span>
        <span className="mt-1 block truncate text-base font-semibold text-[#17324A]">{link.target.title}</span>
        <span className="mt-1 line-clamp-2 text-sm leading-6 text-[#5D7285]">{link.target.summary || '暂无摘要'}</span>
      </span>
      {link.target.href ? <ArrowUpRight size={17} className="mt-1 shrink-0 text-[#8BA6B8]" /> : null}
    </span>
  );

  if (!link.target.href) {
    return <div>{content}</div>;
  }

  return (
    <a href={link.target.href} className="block">
      {content}
    </a>
  );
}
