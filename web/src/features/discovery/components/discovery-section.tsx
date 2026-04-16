import { ChevronRight, Sparkles, Tag } from 'lucide-react';

import { SectionHeading } from '@/components/layout/template-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { DiscoveryItem, DiscoverySection as DiscoverySectionType } from '@/lib/types';
import { formatDateLabel } from '@/lib/utils';

export function DiscoverySection({ section }: { section: DiscoverySectionType }) {
  return (
    <section className="w-full py-20">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHeading eyebrow={section.kind} title={section.title} description={section.description} />
        <Badge variant="neutral" className="w-fit self-start md:self-auto">
          {section.count} items
        </Badge>
      </div>

      {section.items.length === 0 ? (
        <Card className="mt-10 bg-white/75">
          <CardContent className="p-6 text-sm leading-7 text-[#5D6D7E]">当前没有该类型页面，可先从 raw/source 或 durable wiki page 开始补全。</CardContent>
        </Card>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {section.items.map((item) => (
            <DiscoveryStoryCard key={item.path} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function DiscoveryStoryCard({ item }: { item: DiscoveryItem }) {
  const tags = item.tags.slice(0, 2);

  return (
    <a href={item.links.app} className="group block h-full">
      <Card className="h-full border-white bg-white/80 p-0 shadow-[0_4px_20px_rgba(102,204,255,0.08)] backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(102,204,255,0.2)]">
        <CardContent className="flex h-full flex-col p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <span
                  key={tag}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${
                    index === 0 ? 'border-[#66CCFF]/20 bg-[#F0F8FF] text-[#66CCFF]' : 'border-gray-100 bg-gray-50 text-[#5D6D7E]'
                  }`}
                >
                  {index === 0 ? <Tag size={12} /> : null}
                  {tag}
                </span>
              ))}
            </div>
            {item.kind && (
              <span className="rounded-md border border-gray-100 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-400">{item.kind}</span>
            )}
          </div>

          <h3 className="line-clamp-2 text-xl font-bold leading-snug text-[#1C2833]">{item.title}</h3>
          <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#5D6D7E]">{item.summary || '该页面暂无摘要，可进入页面查看更多细节。'}</p>

          <div className="mt-auto pt-6">
            <div className="flex items-center justify-between border-t border-gray-100 pt-4 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-[#FFB7C5]">
                <Sparkles size={14} />
                AI 已审阅
              </div>
              <div className="text-gray-400">{formatDateLabel(item.updated_at)}</div>
            </div>
            <div className="mt-4 flex items-center justify-end">
              <span className="inline-flex items-center gap-1 text-sm font-bold text-[#1C2833] transition-colors group-hover:text-[#66CCFF]">
                阅读页面
                <ChevronRight size={18} />
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
