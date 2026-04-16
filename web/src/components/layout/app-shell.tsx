import type { ReactNode } from 'react';
import { Database, Home, MessageSquare, Settings2 } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';

const navItems = [
  { to: '/app/discovery', label: '知识库', icon: Database },
  { to: '/app/console', label: '控制台', icon: Settings2 },
  { to: '/app/ai-chat', label: 'AI Chat', icon: MessageSquare }
] as const;

export function AppShell({
  title,
  description,
  children,
  sidebar,
  actions,
  contentClassName
}: {
  title: string;
  description?: string;
  children: ReactNode;
  sidebar?: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFFFF] to-[#F0F8FF] font-sans text-[#1C2833]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-[248px] shrink-0 rounded-[16px] border border-white/50 bg-white/75 p-6 shadow-[0_4px_20px_rgba(102,204,255,0.15)] backdrop-blur-md lg:flex lg:flex-col">
          <a href="/app" className="flex items-center gap-2 text-lg font-bold text-[#1C2833]">
            <Home size={18} className="text-[#66CCFF]" />
            LLM-Wiki
          </a>

          <div className="mt-10 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Workspace</div>
          <nav className="mt-4 flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-[12px] px-4 py-3 text-sm font-bold transition-all',
                      isActive ? 'bg-[#66CCFF] text-white shadow-md' : 'text-[#5D6D7E] hover:bg-[#F0F8FF] hover:text-[#66CCFF]'
                    )
                  }
                >
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {sidebar ? <div className="mt-8 flex-1">{sidebar}</div> : <div className="mt-auto text-xs leading-6 text-[#5D6D7E]">以更克制的方式浏览 wiki、执行运行任务并维护长期知识。</div>}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="rounded-[16px] border border-white/50 bg-white/70 p-6 shadow-[0_4px_20px_rgba(102,204,255,0.15)] backdrop-blur-md">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#66CCFF]">Operations Surface</p>
                <h1 className="mt-2 text-3xl font-bold text-[#1C2833] md:text-4xl">{title}</h1>
                {description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5D6D7E] md:text-base">{description}</p> : null}
              </div>
              {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
            </div>
          </header>

          <main className={cn('min-w-0', contentClassName)}>{children}</main>
        </div>
      </div>
    </div>
  );
}
