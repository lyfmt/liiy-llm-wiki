import { ArrowUpRight, Database, FileText, Home, Tag } from 'lucide-react';

import { FloatingAssistantButton, ShellContainer } from '@/components/layout/template-primitives';
import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { useRawSources } from '@/features/raw/hooks/use-raw-sources';
import type { SourceManifestStatus } from '@/lib/types';
import { formatDateLabel } from '@/lib/utils';

const statusLabels: Record<SourceManifestStatus, string> = {
  inbox: 'Inbox',
  accepted: 'Accepted',
  rejected: 'Rejected',
  processed: 'Processed'
};

export function RawIndexPage() {
  const { data, error, loading } = useRawSources();
  const sources = data ?? [];

  return (
    <ShellContainer className="min-h-screen bg-[#F7FCFF]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-7">
        <header className="flex flex-col gap-6 border-b border-[#D8EAF7] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <a
              href="/app"
              className="inline-flex items-center gap-2 rounded-[8px] px-2 py-1 text-sm font-semibold text-[#5D7285] transition hover:bg-white hover:text-[#17324A]"
            >
              <Home size={16} />
              Home
            </a>
            <p className="mt-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#3BAAEF]">
              <Database size={15} />
              Raw Evidence
            </p>
            <h1 className="mt-3 text-4xl font-semibold text-[#17324A]">Raw 资源</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#5D7285]">
              只读查看原始资料身份、状态和文本内容。结构化知识仍然留在知识库中浏览。
            </p>
          </div>
          <div className="rounded-[8px] bg-white px-5 py-4 text-right shadow-sm ring-1 ring-[#D8EAF7]">
            <p className="text-xs font-semibold text-[#6D8292]">资源数</p>
            <p className="mt-1 text-3xl font-semibold text-[#17324A]">{sources.length}</p>
          </div>
        </header>

        <main className="min-h-0 flex-1 py-6">
          {loading ? <LoadingState label="正在读取 Raw 资源..." /> : null}
          {error ? <ErrorState title="Raw 资源读取失败" message={error} /> : null}

          {!loading && !error ? (
            <div className="grid gap-3">
              {sources.map((source) => (
                <a
                  key={source.id}
                  href={`/app/raw/${encodeURIComponent(source.id)}`}
                  className="group rounded-[8px] bg-white p-5 shadow-sm ring-1 ring-[#D8EAF7] transition hover:-translate-y-0.5 hover:ring-[#9ED8FF]"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF6FF] px-3 py-1 text-xs font-semibold text-[#2479B5]">
                          <FileText size={14} />
                          {source.type}
                        </span>
                        <span className="rounded-full bg-[#F0FAF6] px-3 py-1 text-xs font-semibold text-[#3B7A5B]">
                          {statusLabels[source.status]}
                        </span>
                      </div>
                      <h2 className="mt-3 truncate text-xl font-semibold text-[#17324A] group-hover:text-[#2479B5]">
                        {source.title}
                      </h2>
                      <p className="mt-2 truncate text-sm text-[#5D7285]">{source.raw_path}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {source.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#F5FBFF] px-2.5 py-1 text-xs text-[#6D8292]">
                            <Tag size={12} />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm text-[#6D8292]">
                      <span>{formatDateLabel(source.imported_at)}</span>
                      <ArrowUpRight size={18} className="text-[#8BA6B8] transition group-hover:text-[#2479B5]" />
                    </div>
                  </div>
                </a>
              ))}

              {sources.length === 0 ? (
                <div className="rounded-[8px] bg-white px-6 py-12 text-center shadow-sm ring-1 ring-[#D8EAF7]">
                  <FileText className="mx-auto text-[#9ED8FF]" size={36} />
                  <h2 className="mt-3 text-lg font-semibold text-[#17324A]">暂无 Raw 资源</h2>
                  <p className="mt-2 text-sm text-[#5D7285]">导入原始资料后会显示在这里。</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      <FloatingAssistantButton />
    </ShellContainer>
  );
}
