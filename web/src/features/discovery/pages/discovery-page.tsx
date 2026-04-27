import { ArrowRight, Clock, Database, FileText, Settings } from 'lucide-react';

import { ShellContainer, SkyBackground, ZipTopNav } from '@/components/layout/template-primitives';
import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { useDiscovery } from '@/features/discovery/hooks/use-discovery';
import type { DiscoveryItem } from '@/lib/types';
import { formatDateLabel } from '@/lib/utils';

const kindIcons: Record<DiscoveryItem['kind'], typeof Database> = {
  taxonomy: Settings,
  topic: Database,
  entity: FileText,
  query: FileText,
  source: FileText
};

export function DiscoveryPage() {
  const { data, error, loading } = useDiscovery();
  const latestArticles = data?.sections
    .flatMap((section) => section.items)
    .filter((item) => item.kind !== 'source')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4) || [];

  return (
    <ShellContainer className="min-h-screen overflow-x-hidden bg-slate-50">
      <ZipTopNav active="home" />

      <main className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-4 pb-44 pt-20 text-center md:py-24">
        <SkyBackground />
        <div className="relative z-10 max-w-4xl px-6">
          <h1 className="mb-6 text-6xl font-bold leading-tight tracking-tight text-slate-900 md:text-8xl">
            Build Your Smart <br />
            <span className="text-brand">Knowledge Base</span>
          </h1>
          <p className="mx-auto mb-12 max-w-2xl text-xl font-medium leading-relaxed text-slate-500">
            把知识整理成可随时检索、持续生长的智慧库。
          </p>
          <a
            href="/app/kb"
            className="group inline-flex items-center gap-3 rounded-[16px] bg-brand px-10 py-5 text-lg font-bold text-white shadow-xl shadow-blue-500/20 transition-all hover:scale-[1.02] hover:bg-blue-700 active:scale-95"
          >
            Enter Knowledge Base
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </main>

      <section className="border-t border-slate-100 bg-white py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-10 flex items-center gap-3 text-2xl font-bold text-slate-900">
            <Clock className="h-6 w-6 text-brand" />
            Recent Updates
          </h2>

          {loading ? <LoadingState label="正在读取最近更新..." /> : null}
          {error ? <ErrorState title="首页数据读取失败" message={error} /> : null}

          {!loading && !error ? (
            <div className="divide-y divide-slate-100">
              {latestArticles.map((article) => {
                const Icon = kindIcons[article.kind] ?? FileText;

                return (
                  <a
                    key={article.path}
                    href={article.links.app}
                    className="group flex items-center justify-between gap-6 py-6 transition-all hover:pl-2"
                  >
                    <div className="flex min-w-0 items-center gap-5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-slate-50 text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-brand">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 text-left">
                        <h3 className="truncate font-bold text-slate-800 transition-colors group-hover:text-brand">{article.title}</h3>
                        <p className="mt-0.5 truncate text-sm text-slate-400">
                          {article.kind} · {article.summary || '暂无摘要'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-medium text-slate-400">{formatDateLabel(article.updated_at)}</div>
                  </a>
                );
              })}

              {latestArticles.length === 0 ? (
                <div className="rounded-[12px] bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                  暂无知识更新。
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

    </ShellContainer>
  );
}
