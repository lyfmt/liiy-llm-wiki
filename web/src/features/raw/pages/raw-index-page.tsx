import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronRight, Database, Eye, FileText, Search } from 'lucide-react';

import { FloatingAssistantButton, ShellContainer } from '@/components/layout/template-primitives';
import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { useRawSource } from '@/features/raw/hooks/use-raw-source';
import { useRawSources } from '@/features/raw/hooks/use-raw-sources';
import type { SourceManifestStatus, SourceSummary } from '@/lib/types';
import { cn, formatDateLabel } from '@/lib/utils';

const statusLabels: Record<SourceManifestStatus, string> = {
  inbox: 'Inbox',
  accepted: 'Accepted',
  rejected: 'Rejected',
  processed: 'Processed'
};

export function RawIndexPage() {
  const { data, error, loading } = useRawSources();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const sources = data ?? [];
  const filteredSources = useMemo(() => filterSources(sources, query), [sources, query]);
  const selectedSourceId = selectedId ?? filteredSources[0]?.id;
  const selectedSummary = filteredSources.find((source) => source.id === selectedSourceId) ?? filteredSources[0] ?? null;
  const rawDetail = useRawSource(selectedSummary?.id);

  useEffect(() => {
    if (!selectedId && filteredSources[0]) {
      setSelectedId(filteredSources[0].id);
    }
  }, [filteredSources, selectedId]);

  return (
    <ShellContainer className="h-screen min-h-0 overflow-hidden bg-slate-50">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 md:px-8">
        <div className="flex items-center gap-10">
          <a href="/app" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-brand text-white">
              <Database className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold text-slate-900">
              LLM-Wiki-Liiy <span className="ml-2 rounded-full bg-brand px-2 py-0.5 align-middle text-[10px] text-white">RAW</span>
            </span>
          </a>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="/app/kb" className="text-sm font-medium text-slate-500 transition hover:text-brand">Knowledge</a>
            <a href="/app/raw" className="border-b-2 border-brand py-5 text-sm font-bold text-brand">Explore Raw</a>
            <a href="/app/console" className="text-sm font-medium text-slate-500 transition hover:text-brand">Settings</a>
          </nav>
        </div>
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search raw resources..."
            className="w-80 rounded-[12px] border border-transparent bg-slate-100 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-blue-100 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </header>

      <div className="flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden">
        <aside className="flex w-[400px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 p-6">
            <h1 className="font-bold text-slate-900">
              Raw Resources
              <span className="ml-2 rounded-[8px] bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-brand">
                {filteredSources.length}
              </span>
            </h1>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {loading ? <LoadingState label="正在读取 Raw 资源..." /> : null}
            {error ? <ErrorState title="Raw 资源读取失败" message={error} /> : null}
            {!loading && !error ? (
              <>
                {filteredSources.map((source) => (
                  <RawResourceCard
                    key={source.id}
                    source={source}
                    active={source.id === selectedSummary?.id}
                    onSelect={() => setSelectedId(source.id)}
                  />
                ))}
                {filteredSources.length === 0 ? (
                  <div className="rounded-[16px] bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                    没有匹配的 Raw 资源。
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-8">
          {selectedSummary ? (
            <div className="flex min-h-full flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
              <div className="flex items-start justify-between gap-6 border-b border-slate-100 p-8">
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-2xl font-bold text-slate-900">{selectedSummary.title}</h2>
                    <span className="inline-flex items-center gap-1 rounded-[6px] bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                      <Eye className="h-3 w-3" />
                      Read-only
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <span className="rounded-[8px] border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                      {selectedSummary.raw_path}
                    </span>
                    <span className="rounded-[8px] border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                      Imported: {formatDateLabel(selectedSummary.imported_at)}
                    </span>
                  </div>
                </div>
                <a
                  href={`/app/raw/${encodeURIComponent(selectedSummary.id)}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-[12px] bg-brand px-4 py-2 text-sm font-semibold text-white shadow-brand-soft transition hover:bg-blue-700"
                >
                  Open
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>

              <div className="min-h-0 flex-1 bg-white">
                {rawDetail.loading ? (
                  <div className="p-8">
                    <LoadingState label="正在读取 Raw 文本..." />
                  </div>
                ) : null}
                {rawDetail.error ? (
                  <div className="p-8">
                    <ErrorState title="Raw 文本读取失败" message={rawDetail.error} />
                  </div>
                ) : null}
                {rawDetail.data ? <RawPreview body={rawDetail.data.body} /> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-[20px] bg-white px-6 py-12 text-center text-slate-500 shadow-sm">
              选择一个 Raw 资源查看原文预览。
            </div>
          )}
        </main>
      </div>

      <FloatingAssistantButton />
    </ShellContainer>
  );
}

function RawResourceCard({
  source,
  active,
  onSelect
}: {
  source: SourceSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-[16px] border p-4 text-left transition-all',
        active ? 'border-brand bg-blue-50/70 shadow-md ring-2 ring-blue-100' : 'border-slate-100 bg-white hover:bg-slate-50'
      )}
    >
      <div className="flex gap-4">
        <div className="flex h-14 w-12 shrink-0 items-center justify-center rounded-[12px] border-b-4 border-brand bg-blue-50 text-brand">
          <FileText className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 truncate text-sm font-bold text-slate-900">{source.title}</h3>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-slate-400">
            <span>{source.type.toUpperCase()}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>{source.raw_path}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="rounded-[6px] bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-brand">
              {statusLabels[source.status]}
            </span>
            <span className="text-[10px] text-slate-400">{formatDateLabel(source.imported_at)}</span>
          </div>
        </div>
        <ChevronRight className="mt-4 h-4 w-4 shrink-0 text-slate-300" />
      </div>
    </button>
  );
}

function RawPreview({ body }: { body: string }) {
  const lines = splitPreviewLines(body);

  return (
    <div className="flex min-h-[560px] bg-slate-50/40 font-mono text-[13px] leading-relaxed">
      <div className="flex w-12 shrink-0 flex-col items-center border-r border-slate-100 bg-slate-50 py-6 text-slate-300">
        {lines.map((_line, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <pre className="min-w-0 flex-1 whitespace-pre-wrap px-8 py-6 text-slate-700">{lines.join('\n')}</pre>
    </div>
  );
}

function splitPreviewLines(value: string): string[] {
  const lines = value.replace(/\r\n/gu, '\n').split('\n');
  const trimmed = value.endsWith('\n') ? lines.slice(0, -1) : lines;
  return trimmed.slice(0, 80);
}

function filterSources(sources: SourceSummary[], query: string): SourceSummary[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return sources;

  return sources.filter((source) =>
    [source.title, source.raw_path, source.type, source.status, ...source.tags]
      .some((value) => value.toLowerCase().includes(normalized))
  );
}
