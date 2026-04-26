import { Database, Home, Search, Settings, Sparkles, Tag, X, BookOpen, Folder, FileBox } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';

import { FloatingAssistantButton, ShellContainer } from '@/components/layout/template-primitives';
import { ErrorState, LoadingState } from '@/components/layout/status-cards';
import { useDiscovery } from '@/features/discovery/hooks/use-discovery';
import { formatDateLabel } from '@/lib/utils';
import type { DiscoveryItem } from '@/lib/types';

type ResourceKind = DiscoveryItem['kind'] | 'all';

const kindMetadata: Record<ResourceKind, { label: string; icon: LucideIcon; color: string }> = {
  all: { label: '全部文章', icon: Database, color: 'text-[#66CCFF]' },
  taxonomy: { label: '分类 (Taxonomy)', icon: Folder, color: 'text-[#4DB8FF]' },
  topic: { label: '主题 (Topics)', icon: BookOpen, color: 'text-[#9B51E0]' },
  entity: { label: '实体 (Entities)', icon: Tag, color: 'text-[#FFB7C5]' },
  query: { label: '查询 (Queries)', icon: Search, color: 'text-[#4DB8FF]' },
  source: { label: '来源 (Sources)', icon: FileBox, color: 'text-[#5D6D7E]' }
};

export function KnowledgeBasePage() {
  const { data, error, loading } = useDiscovery();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKind, setActiveKind] = useState<ResourceKind>('all');

  const allArticles = useMemo(() => data?.sections.flatMap(s => s.items) || [], [data]);
  
  const stats = useMemo(() => {
    return {
      all: allArticles.length,
      taxonomy: allArticles.filter(a => a.kind === 'taxonomy').length,
      topic: allArticles.filter(a => a.kind === 'topic').length,
      entity: allArticles.filter(a => a.kind === 'entity').length,
      query: allArticles.filter(a => a.kind === 'query').length,
      source: allArticles.filter(a => a.kind === 'source').length,
    };
  }, [allArticles]);

  const filteredArticles = useMemo(() => {
    return allArticles.filter(article => {
      const matchesKind = activeKind === 'all' || article.kind === activeKind;
      const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           article.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesKind && matchesSearch;
    }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [allArticles, activeKind, searchQuery]);

  return (
    <ShellContainer className="bg-[#FFFFFF] flex font-sans">
      {/* Sidebar for Layered Categorization */}
      <aside className="w-[280px] bg-white h-screen fixed left-0 top-0 p-6 flex flex-col border-r-4 border-[#1C2833] z-10">
        <a href="/app" className="flex items-center gap-2 text-[#5D6D7E] hover:text-[#66CCFF] font-bold mb-10 transition-colors w-fit">
          <Home size={18} /> RETURN HOME
        </a>

        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Folder size={16} /> RESOURCE TYPES
        </h4>
        
        <nav className="flex flex-col gap-3">
          {(Object.keys(kindMetadata) as ResourceKind[]).map((kind) => {
            const Icon = kindMetadata[kind].icon;
            const isActive = activeKind === kind;
            return (
              <button
                key={kind}
                onClick={() => setActiveKind(kind)}
                className={`flex items-center justify-between p-3 transition-all font-bold text-sm border-2 ${
                  isActive 
                    ? 'bg-[#66CCFF] text-[#1C2833] border-[#1C2833] shadow-[2px_2px_0_0_#1C2833]' 
                    : 'text-[#5D6D7E] border-transparent hover:bg-[#F0F8FF] hover:border-[#1C2833]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className={isActive ? 'text-[#1C2833]' : kindMetadata[kind].color} />
                  {kindMetadata[kind].label.toUpperCase()}
                </div>
                <span className={`text-[12px] px-2 py-0.5 border ${isActive ? 'bg-white/40 border-[#1C2833] text-[#1C2833]' : 'bg-gray-100 border-transparent text-[#5D6D7E]'}`}>
                  {stats[kind]}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-8 border-t-2 border-[#1C2833]">
           <a href="/app/console" className="flex items-center gap-2 text-[#5D6D7E] hover:text-[#66CCFF] text-md font-bold transition-colors">
             <Settings size={18} /> ADMIN PANEL
           </a>
        </div>
      </aside>

      <main className="ml-[280px] flex-1 p-12 pb-40 relative">
        <header className="mb-12">
          <div className="flex items-center gap-3 text-lg font-bold text-[#66CCFF] uppercase tracking-tighter mb-4">
             <Database size={20} /> KNOWLEDGE EXPLORER
          </div>
          <h1 className="text-5xl font-extrabold text-[#1C2833] tracking-tighter uppercase">
            {kindMetadata[activeKind].label}
          </h1>
          <p className="mt-3 text-2xl font-bold text-[#5D6D7E]">
            FOUND <span className="text-[#66CCFF]">{filteredArticles.length}</span> MATCHING ITEMS
          </p>
        </header>

        {loading ? <LoadingState label="RETRIEVING DATA..." /> : null}
        {error ? <ErrorState title="RETRIEVAL FAILED" message={error} /> : null}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {filteredArticles.map((article) => (
            <a key={article.path} href={article.links.app} className="group h-full">
              <div className="h-full bg-white pixel-border p-6 transition-all hover:-translate-y-1">
                <div className="flex h-full flex-col">
                  <div className="mb-4 flex items-center justify-between">
                    <span className={`flex items-center gap-1 border-2 border-[#1C2833] bg-gray-50 px-3 py-1 text-xs font-bold ${kindMetadata[article.kind]?.color || 'text-gray-400'}`}>
                      {article.kind.toUpperCase()}
                    </span>
                    <span className="text-xs font-bold text-gray-400">{formatDateLabel(article.updated_at)}</span>
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-[#1C2833] group-hover:text-[#66CCFF] transition-colors uppercase line-clamp-2">{article.title}</h3>
                  <p className="line-clamp-3 text-lg font-bold leading-tight text-[#5D6D7E] mb-6">{article.summary || 'No summary available...'}</p>
                  
                  <div className="mt-auto flex items-center justify-between border-t-2 border-[#1C2833] pt-4">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-[#FFB7C5]">
                      <Sparkles size={16} /> AI REVIEWED
                    </div>
                  </div>
                </div>
              </div>
            </a>
          ))}
          
          {filteredArticles.length === 0 && !loading && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-400">
               <Database size={64} className="mb-4 opacity-20" />
               <p className="text-2xl font-bold uppercase">NO MATCHES FOUND</p>
               <button onClick={() => {setSearchQuery(''); setActiveKind('all');}} className="mt-4 text-[#66CCFF] hover:underline text-lg font-bold uppercase">RESET FILTERS</button>
            </div>
          )}
        </div>

        {/* Bottom Fixed Search Bar */}
        <div className="fixed bottom-10 left-[calc(50%+140px)] -translate-x-1/2 z-40 w-full max-w-2xl px-6">
          <div className="flex items-center bg-white p-2.5 shadow-[4px_4px_0_0_#1C2833] border-4 border-[#1C2833] transition-all">
            <div className="flex h-12 w-12 items-center justify-center text-[#1C2833]">
              <Search size={28} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`SEARCH IN ${kindMetadata[activeKind].label.toUpperCase()}...`}
              className="flex-1 bg-transparent px-2 py-3 text-xl font-bold text-[#1C2833] placeholder-gray-400 focus:outline-none pr-4"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="mr-2 p-2 text-gray-400 hover:text-[#1C2833]">
                <X size={22} />
              </button>
            )}
          </div>
        </div>
      </main>

      <FloatingAssistantButton />
    </ShellContainer>
  );
}
