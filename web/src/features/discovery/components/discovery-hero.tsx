import { ArrowRight, Database, Settings } from 'lucide-react';

import { GlassTopNav, SkyBackground } from '@/components/layout/template-primitives';
import { Button } from '@/components/ui/button';
import type { DiscoveryItem, DiscoveryResponse } from '@/lib/types';

export function DiscoveryHero({ data, firstReadable }: { data: DiscoveryResponse | null; firstReadable: DiscoveryItem | null }) {
  return (
    <section className="relative flex min-h-screen flex-col px-4 pt-16 text-center">
      <GlassTopNav
        secondaryAction={
          <a
            href="/app/discovery"
            className="flex items-center gap-2 px-4 py-2 font-medium text-[#5D6D7E] transition-colors hover:text-[#66CCFF]"
          >
            <Database size={18} />
            知识库
          </a>
        }
        primaryAction={
          <a href="/app/console" className="flex items-center gap-2 px-4 py-2 font-medium text-[#5D6D7E] transition-colors hover:text-[#66CCFF]">
            <Settings size={18} />
            后台管理
          </a>
        }
      />

      <SkyBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center py-24">
        <div className="w-full max-w-4xl rounded-[24px] border border-white/60 bg-white/75 p-12 shadow-[0_8px_40px_rgba(102,204,255,0.12)] backdrop-blur-xl md:p-16">
          <h1 className="mb-6 text-5xl font-extrabold text-[#1C2833] drop-shadow-md md:text-6xl">
            Build Your Smart <br />
            <span className="text-[#66CCFF]">Knowledge Base</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl font-medium text-[#5D6D7E]">由大型语言模型 (LLM) 驱动的智能知识库</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <a href={firstReadable?.links.app ?? '/app/discovery'}>
              <Button size="lg" className="px-10 shadow-[0_8px_30px_rgba(102,204,255,0.4)] transition-all hover:scale-105">
                进入知识库
                <ArrowRight size={20} />
              </Button>
            </a>
          </div>
          <div className="mt-16 grid gap-6 md:grid-cols-4">
            <MetricTile label="Topics" value={data?.totals.topics ?? 0} />
            <MetricTile label="Entities" value={data?.totals.entities ?? 0} />
            <MetricTile label="Queries" value={data?.totals.queries ?? 0} />
            <MetricTile label="Sources" value={data?.totals.sources ?? 0} />
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-white/50 bg-white/65 p-5 text-left shadow-[0_4px_20px_rgba(102,204,255,0.15)] backdrop-blur-md">
      <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#66CCFF]">{label}</div>
      <div className="mt-3 text-4xl font-bold text-[#1C2833]">{value}</div>
    </div>
  );
}
