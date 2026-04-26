import { Clock, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { FloatingAssistantButton, ShellContainer } from '@/components/layout/template-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ReadingMarkdown } from '@/features/reading/components/reading-markdown';
import { ReadingSidebar, RelatedPagesPanel } from '@/features/reading/components/reading-sidebar';
import { useKnowledgePage } from '@/features/reading/hooks/use-knowledge-page';
import { clampTags, formatDateLabel } from '@/lib/utils';

export function ReadingPage() {
  const params = useParams();
  const slug = useMemo(() => {
    const wildcard = params['*'];
    if (wildcard) return wildcard;
    return params.slug;
  }, [params]);
  const { data, error, loading } = useKnowledgePage(params.kind, slug);

  if (loading) {
    return (
      <ShellContainer className="bg-white p-8">
        <LoadingState label="正在加载阅读页面…" />
      </ShellContainer>
    );
  }

  if (error || !data) {
    return (
      <ShellContainer className="bg-white p-8">
        <ErrorState title="Reading 加载失败" message={error ?? 'Unknown error'} />
      </ShellContainer>
    );
  }

  const tags = clampTags(data.page.tags, 3);

  return (
    <ShellContainer className="bg-white">
      <div className="flex min-h-screen flex-col font-sans lg:flex-row">
        <ReadingSidebar data={data} headings={[]} />

        <main className="flex-1 bg-white px-6 pb-24 pt-8 lg:px-12 lg:py-12">
          <div className="mx-auto max-w-[800px]">
            <header className="mb-12">
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 md:text-6xl">{data.page.title}</h1>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500">
                <div className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1">
                  <Sparkles size={16} className="text-brand" />
                  <span>AI 助理编撰</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={16} />
                  {formatDateLabel(data.page.updated_at)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, index) => (
                    <Badge key={tag} variant={index === 0 ? 'primary' : 'accent'}>{tag}</Badge>
                  ))}
                </div>
              </div>
              <p className="mt-6 text-lg leading-8 text-slate-500">{data.page.summary || '该页面暂无摘要，可从正文与来源引用中继续阅读。'}</p>
            </header>

            <Card className="border-slate-100 bg-white shadow-none">
              <CardContent className="p-8 md:p-10">
                <ReadingMarkdown body={data.page.body} />
              </CardContent>
            </Card>

            <div className="mt-10">
              <RelatedPagesPanel data={data} />
            </div>
          </div>
        </main>
      </div>

      <FloatingAssistantButton />
    </ShellContainer>
  );
}
