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
    <main className="min-h-0 flex-1 overflow-hidden bg-white">
      <div className="h-full overflow-y-auto px-8 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-400" aria-label="Breadcrumb">
            <button type="button" onClick={() => onPathChange([])} className="font-semibold text-brand hover:text-blue-700">
              知识库
            </button>
            {path.map((node, index) => (
              <span key={node.id} className="flex items-center gap-2">
                <span className="text-slate-300">/</span>
                <button
                  type="button"
                  onClick={() => onPathChange(path.slice(0, index + 1))}
                  className="max-w-[220px] truncate font-semibold text-slate-500 hover:text-slate-900"
                >
                  {node.title}
                </button>
              </span>
            ))}
          </nav>

          <section className="rounded-[20px] border border-slate-100 bg-white px-7 py-6 shadow-xl shadow-slate-200/40">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                  <Network size={15} />
                  {current ? kindLabels[current.kind] : 'Taxonomy Root'}
                </p>
                <h2 className="mt-3 text-4xl font-semibold tracking-normal text-slate-900">{intro.title}</h2>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-500">{intro.summary}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[14px] bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">当前子项</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{children.length}</p>
                </div>
                <div className="rounded-[14px] bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">Graph 链接</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{related.length}</p>
                </div>
              </div>
            </div>
          </section>

          {children.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Rows3 size={17} />
                当前层级
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {children.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onPathChange([...path, node])}
                    className="group rounded-[16px] border border-slate-100 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-xl hover:shadow-blue-100/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand">
                        {kindLabels[node.kind]}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {node.count}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900 group-hover:text-brand">{node.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                      {node.summary || '继续进入此层级查看结构化条目。'}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-[16px] border border-slate-100 bg-white px-6 py-8 text-center shadow-sm">
              <BookOpen className="mx-auto text-blue-200" size={34} />
              <h3 className="mt-3 text-lg font-semibold text-slate-900">当前节点没有下级条目</h3>
              {current?.href ? (
                <a
                  href={current.href}
                  className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  打开阅读页
                  <ArrowUpRight size={16} />
                </a>
              ) : null}
            </section>
          )}

          {related.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
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
    <span className="flex h-full items-start gap-4 rounded-[16px] border border-slate-100 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-brand">
        {link.target.kind === 'evidence' ? <FileText size={18} /> : <Link2 size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
          {relatedLabels[link.type]} · {link.target.kind}
        </span>
        <span className="mt-1 block truncate text-base font-semibold text-slate-900">{link.target.title}</span>
        <span className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{link.target.summary || '暂无摘要'}</span>
      </span>
      {link.target.href ? <ArrowUpRight size={17} className="mt-1 shrink-0 text-slate-300" /> : null}
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
