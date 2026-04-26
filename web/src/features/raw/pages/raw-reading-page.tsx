import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Database, FileText, Hash } from 'lucide-react';

import { FloatingAssistantButton, ShellContainer } from '@/components/layout/template-primitives';
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
    <ShellContainer className="h-screen min-h-0 overflow-hidden bg-[#F7FCFF]">
      <div className="flex h-screen min-h-0 flex-col">
        <header className="shrink-0 border-b border-[#D8EAF7] bg-[#EAF6FF] px-6 py-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <a
                href="/app/raw"
                className="inline-flex items-center gap-2 rounded-[8px] px-2 py-1 text-sm font-semibold text-[#5D7285] transition hover:bg-white/70 hover:text-[#17324A]"
              >
                <ArrowLeft size={16} />
                Raw
              </a>
              <div className="mt-4 flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#2479B5] shadow-sm">
                  <FileText size={21} />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#3BAAEF]">
                    <Database size={14} />
                    Raw Reader
                  </p>
                  <h1 className="mt-1 truncate text-2xl font-semibold text-[#17324A]">{data?.title ?? 'Raw 资源'}</h1>
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
              <aside className="min-h-0 overflow-y-auto border-r border-[#D8EAF7] bg-white px-5 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3BAAEF]">Source</p>
                <h2 className="mt-2 text-lg font-semibold text-[#17324A]">{data.title}</h2>
                <dl className="mt-5 space-y-4 text-sm">
                  <Info label="Raw path" value={data.raw_path} />
                  <Info label="Type" value={data.type} />
                  <Info label="Hash" value={data.hash} />
                </dl>
                {data.tags.length > 0 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {data.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[#EAF6FF] px-3 py-1 text-xs font-semibold text-[#2479B5]">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {highlightedLines.length > 0 ? (
                  <div className="mt-6 rounded-[8px] bg-[#F0FAF6] px-4 py-3 text-sm text-[#3B7A5B]">
                    已定位到第 {highlightedLines[0]} 行
                    {highlightedLines.length > 1 ? ` - ${highlightedLines.at(-1)}` : ''}
                  </div>
                ) : null}
              </aside>

              <section className="min-h-0 overflow-y-auto bg-[#F7FCFF] px-5 py-6">
                <div className="mx-auto max-w-5xl overflow-hidden rounded-[8px] bg-white shadow-sm ring-1 ring-[#D8EAF7]">
                  <div className="border-b border-[#D8EAF7] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#6D8292]">
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
                          <div className="select-none border-r border-[#E6F1F8] bg-[#F5FBFF] px-3 py-1 text-right text-[#8BA6B8]">
                            {lineNumber}
                          </div>
                          <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-1 text-[#17324A]">{line || ' '}</pre>
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

      <FloatingAssistantButton />
    </ShellContainer>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white px-4 py-3 shadow-sm ring-1 ring-[#D8EAF7]">
      <p className="text-xs font-semibold text-[#6D8292]">{label}</p>
      <p className="mt-1 truncate font-semibold text-[#17324A]">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#8BA6B8]">
        <Hash size={12} />
        {label}
      </dt>
      <dd className="mt-1 break-words text-[#315C7A]">{value}</dd>
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
