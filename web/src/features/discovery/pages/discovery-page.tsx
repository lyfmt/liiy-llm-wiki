import { ChevronRight, Sparkles, Database, Settings, Clock, Tag, FileText } from 'lucide-react';

import { FloatingAssistantButton, ShellContainer, SkyBackground } from '@/components/layout/template-primitives';
import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { useDiscovery } from '@/features/discovery/hooks/use-discovery';
import { formatDateLabel } from '@/lib/utils';

export function DiscoveryPage() {
  const { data, error, loading } = useDiscovery();
  
  const latestArticles = data?.sections
    .flatMap((section) => section.items)
    .filter((item) => item.kind !== 'source')
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 3) || [];

  return (
    <ShellContainer className="bg-[#FFFFFF] pb-32">
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-[#D8EAF7] bg-white/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xl font-bold text-[#1C2833]">
          <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#EAF6FF] text-[#2479B5]">
            <Database size={22} />
          </div>
          <span className="tracking-normal">LLM-Wiki-Liiy</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/app/kb"
            className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold text-[#5D7285] transition-colors hover:bg-[#EAF6FF] hover:text-[#17324A]"
          >
            <Database size={18} />
            Knowledge
          </a>
          <a
            href="/app/raw"
            className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold text-[#5D7285] transition-colors hover:bg-[#EAF6FF] hover:text-[#17324A]"
          >
            <FileText size={18} />
            Raw
          </a>
          <a href="/app/console" className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold text-[#5D7285] transition-colors hover:bg-[#EAF6FF] hover:text-[#17324A]">
            <Settings size={18} />
            Settings
          </a>
        </div>
      </nav>

      <section className="relative flex min-h-[85vh] flex-col items-center justify-center px-4 pt-16 text-center">
        <SkyBackground />
        
        <div className="relative z-10 w-full max-w-4xl p-12 bg-white/80 pixel-border md:p-16">
          <h1 className="mb-6 text-5xl font-extrabold text-[#1C2833] md:text-7xl uppercase tracking-tighter">
            Build Your Smart <br />
            <span className="text-[#66CCFF]">Knowledge Base</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-2xl font-bold text-[#5D6D7E]">
            由大型语言模型 (LLM) 驱动的智能知识库
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <a href="/app/kb">
              <button className="pixel-button text-xl px-8 py-3 flex items-center gap-2">
                ENTER KNOWLEDGE BASE
                <ChevronRight size={20} />
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Latest Articles: Left-Right Tree Structure */}
      <section className="relative z-20 mx-auto w-full max-w-5xl px-8 py-24">
        <div className="mb-16 flex items-center gap-3">
          <Clock className="text-[#1C2833]" size={32} />
          <h2 className="text-4xl font-bold text-[#1C2833] uppercase">RECENT UPDATES</h2>
        </div>

        {loading ? <LoadingState label="LOADING..." /> : null}
        {error ? <ErrorState title="ERROR" message={error} /> : null}

        <div className="relative flex flex-col gap-12">
          {/* Central Tree Line */}
          <div className="absolute left-1/2 top-0 hidden h-full w-1 -translate-x-1/2 bg-[#1C2833] md:block"></div>

          {latestArticles.map((article, index) => (
            <div 
              key={article.path} 
              className={`relative flex w-full flex-col md:flex-row md:items-center ${
                index % 2 === 0 ? 'md:justify-start' : 'md:justify-end'
              }`}
            >
              {/* Box on the tree */}
              <div className="absolute left-1/2 top-1/2 hidden h-6 w-6 -translate-x-1/2 -translate-y-1/2 bg-[#66CCFF] border-4 border-[#1C2833] md:block"></div>
              
              <a 
                href={article.links.app}
                className={`group w-full md:w-[45%] bg-white/90 p-6 pixel-border transition-all hover:-translate-y-1 ${
                  index % 2 === 0 ? 'md:mr-auto' : 'md:ml-auto'
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-1 bg-[#F0F8FF] px-3 py-1 text-sm font-bold text-[#66CCFF] border-2 border-[#1C2833]">
                    <Tag size={14} /> {article.tags[0]?.toUpperCase() || 'INFO'}
                  </span>
                  <span className="text-sm font-bold text-[#1C2833]">{formatDateLabel(article.updated_at)}</span>
                </div>
                <h3 className="mb-3 text-2xl font-bold text-[#1C2833] transition-colors group-hover:text-[#66CCFF] uppercase">{article.title}</h3>
                <p className="line-clamp-2 text-lg font-bold leading-tight text-[#5D6D7E]">{article.summary || 'Click to read more...'}</p>
                <div className="mt-4 flex items-center gap-2 text-sm font-bold text-[#FFB7C5]">
                  <Sparkles size={16} /> AI REVIEWED
                </div>
              </a>
            </div>
          ))}

          {latestArticles.length === 0 && !loading && (
            <div className="text-center font-bold text-gray-400">NO RECORDS FOUND</div>
          )}
        </div>

        <div className="mt-20 text-center">
          <a href="/app/kb" className="pixel-button inline-flex items-center gap-2">
            VIEW ALL ARTICLES <ChevronRight size={18} />
          </a>
        </div>
      </section>

      <FloatingAssistantButton />
    </ShellContainer>
  );
}
