import type { ReactNode } from 'react';
import { Database, FileText, MessageSquare, Orbit, Settings } from 'lucide-react';

import { cn } from '@/lib/utils';

export function SkyBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-slate-50">
      <div className="absolute left-10 top-1/4 opacity-20" aria-hidden="true">
        <div className="h-40 w-32 -rotate-12 rounded-[8px] border-2 border-slate-300" />
        <div className="absolute left-0 top-0 h-40 w-32 rounded-[8px] border-2 border-slate-300 bg-white shadow-xl" />
      </div>
      <div className="absolute right-12 top-1/3 scale-150 opacity-10" aria-hidden="true">
        <div className="flex h-48 w-48 items-center justify-center rounded-full border-2 border-slate-400">
          <div className="h-24 w-24 rounded-[8px] border-2 border-slate-400" />
        </div>
      </div>
    </div>
  );
}

export function GlassTopNav({
  primaryAction,
  secondaryAction,
  title = 'LLM-Wiki'
}: {
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  title?: string;
}) {
  return (
    <nav className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-white/30 bg-white/70 px-6 py-4 backdrop-blur-md">
      <a href="/app" className="flex items-center gap-2 text-xl font-bold text-[#1C2833]">
        <Orbit className="text-[#66CCFF]" size={24} />
        {title}
      </a>
      <div className="flex items-center gap-2">
        {secondaryAction}
        {primaryAction}
      </div>
    </nav>
  );
}

export function FloatingAssistantButton({ href = '/app/ai-chat' }: { href?: string }) {
  return (
    <a href={href} className="group fixed bottom-8 right-8 z-50 block cursor-pointer">
      <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-white px-3 py-1 text-sm font-semibold text-slate-800 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        AI 助手
        <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
      </div>
      <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-brand text-white shadow-2xl shadow-blue-500/30 transition-all hover:scale-105 hover:bg-blue-700">
        <MessageSquare size={28} />
      </div>
    </a>
  );
}

export function ShellContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('relative min-h-screen bg-slate-50 font-sans text-slate-900', className)}>{children}</div>;
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div>
      {eyebrow ? <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#66CCFF]">{eyebrow}</p> : null}
      <h2 className="mt-2 text-3xl font-bold text-[#1C2833] md:text-4xl">{title}</h2>
      {description ? <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5D6D7E] md:text-base">{description}</p> : null}
    </div>
  );
}

export function ZipTopNav({ active }: { active?: 'home' | 'knowledge' | 'raw' | 'settings' }) {
  const items = [
    { id: 'knowledge', href: '/app/kb', label: 'Knowledge', icon: Database },
    { id: 'raw', href: '/app/raw', label: 'Raw', icon: FileText },
    { id: 'settings', href: '/app/console', label: 'Settings/Admin', icon: Settings }
  ] as const;

  return (
    <nav className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-100 bg-white/85 px-6 backdrop-blur-md md:px-12">
      <a href="/app" className="group flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-brand text-white shadow-sm ring-2 ring-blue-100">
          <Orbit size={20} />
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900 transition-colors group-hover:text-brand">
          LLM-Wiki-Liiy
        </span>
      </a>
      <div className="flex items-center gap-2 md:gap-8">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <a
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold transition-colors',
                isActive ? 'bg-blue-50 text-brand' : 'text-slate-600 hover:bg-slate-50 hover:text-brand'
              )}
            >
              <Icon size={17} />
              <span className="hidden sm:inline">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
