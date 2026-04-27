import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Database, FileText, Hash } from 'lucide-react';

import { ShellContainer } from '@/components/layout/template-primitives';
import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { useRawSource } from '@/features/raw/hooks/use-raw-source';
import { formatDateLabel } from '@/lib/utils';

export function RawReadingPage() {
  const { sourceId } = useParams();
  const [searchParams] = useSearchParams();
  const { data, error, loading } = useRawSource(sourceId);
  const highlightedLines = useMemo(
    () => parseLineRange(searchParams.get('line'), searchParams.get('locator')),
    [searchParams]
  );
  const lines = useMemo(() => splitLines(data?.body ?? ''), [data?.body]);

  useEffect(() => {
    const firstLine = highlightedLines.at(0);
    if (!firstLine) return;

    document.getElementById(`raw-line-${firstLine}`)?.scrollIntoView({ block: 'center' });
  }, [highlightedLines, data]);

  return (
    <ShellContainer className="h-screen min-h-0 overflow-hidden bg-slate-50">
      <div className="flex h-screen min-h-0 flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <a
                href="/app/raw"
                className="inline-flex items-center gap-2 rounded-[8px] px-2 py-1 text-sm font-semibold text-brand transition hover:bg-blue-50 hover:text-blue-700"
              >
                <ArrowLeft size={16} />
                Raw
              </a>
              <div className="mt-4 flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-blue-50 text-brand">
                  <FileText size={21} />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                    <Database size={14} />
                    Raw Reader
                  </p>
                  <h1 className="mt-1 truncate text-2xl font-semibold text-slate-900">{data?.title ?? 'Raw 资源'}</h1>
                </div>
              </div>
            </div>

            {data ? (
              <div className="grid shrink-0 grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <Meta label="行数" value={String(data.line_count)} />
                <Meta label="状态" value={data.status} />
                <Meta label="导入" value={formatDateLabel(data.imported_at)} />
              </div>
            ) : null}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="p-8">
              <LoadingState label="正在读取 Raw 文本..." />
            </div>
          ) : null}
          {error ? (
            <div className="p-8">
              <ErrorState title="Raw 文本读取失败" message={error} />
            </div>
          ) : null}

          {data && !loading && !error ? (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white px-5 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Source</p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">{data.title}</h2>
                <dl className="mt-5 space-y-4 text-sm">
                  <Info label="Raw path" value={data.raw_path} />
                  <Info label="Type" value={data.type} />
                  <Info label="Hash" value={data.hash} />
                </dl>
                {data.tags.length > 0 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {data.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {highlightedLines.length > 0 ? (
                  <div className="mt-6 rounded-[10px] bg-blue-50 px-4 py-3 text-sm text-brand">
                    已定位到第 {highlightedLines[0]} 行
                    {highlightedLines.length > 1 ? ` - ${highlightedLines.at(-1)}` : ''}
                  </div>
                ) : null}
              </aside>

              <section className="min-h-0 overflow-y-auto bg-slate-50 px-5 py-6">
                <div className="mx-auto max-w-5xl overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
                  <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Readonly Text
                  </div>
                  <div className="font-mono text-sm leading-6">
                    {lines.map((line, index) => {
                      const lineNumber = index + 1;
                      const highlighted = highlightedLines.includes(lineNumber);

                      return (
                        <div
                          key={lineNumber}
                          id={`raw-line-${lineNumber}`}
                          className={highlighted ? 'grid grid-cols-[64px_minmax(0,1fr)] bg-[#FFF8D6]' : 'grid grid-cols-[64px_minmax(0,1fr)]'}
                        >
                          <div className="select-none border-r border-slate-100 bg-slate-50 px-3 py-1 text-right text-slate-300">
                            {lineNumber}
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-1 text-slate-700">{line || ' '}</pre>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </main>
      </div>

    </ShellContainer>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        <Hash size={12} />
        {label}
      </dt>
      <dd className="mt-1 break-words text-slate-600">{value}</dd>
    </div>
  );
}

function splitLines(value: string): string[] {
  if (value.length === 0) {
    return [''];
  }

  const normalized = value.replace(/\r\n/gu, '\n');
  const lines = normalized.split('\n');

  return normalized.endsWith('\n') ? lines.slice(0, -1) : lines;
}

function parseLineRange(line: string | null, locator: string | null): number[] {
  const source = line ?? locator;
  if (!source) {
    return [];
  }

  const match = /(?:^|#)L(\d+)(?:-L?(\d+))?/u.exec(source);
  const start = match ? Number.parseInt(match[1], 10) : Number.parseInt(source, 10);
  const end = match?.[2] ? Number.parseInt(match[2], 10) : start;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return [];
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
