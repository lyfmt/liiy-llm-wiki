import type { ReactNode } from 'react';
import { Orbit, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

export function SkyBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden -z-10 bg-gradient-to-b from-[#1a2980] via-[#5b4d9c] to-[#ffb7c5]">
      <svg className="absolute left-10 top-10 h-32 w-96 opacity-30" viewBox="0 0 200 100" aria-hidden="true">
        <path d="M 50 50 A 20 20 0 0 1 90 50 A 30 30 0 0 1 150 50 A 20 20 0 0 1 190 60 L 10 60 A 10 10 0 0 1 50 50" fill="#ffffff" filter="blur(4px)" />
      </svg>
      <svg className="absolute right-10 top-32 h-48 w-[500px] opacity-40" viewBox="0 0 200 100" aria-hidden="true">
        <path d="M 30 60 A 30 30 0 0 1 80 40 A 40 40 0 0 1 160 50 A 25 25 0 0 1 210 70 L -10 70 A 15 15 0 0 1 30 60" fill="#ffebf0" filter="blur(6px)" />
      </svg>
      <div
        className="absolute inset-0 opacity-10"
        style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        aria-hidden="true"
      />
      <div className="absolute bottom-[-100px] left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#66CCFF] opacity-40 blur-[120px] mix-blend-screen" />
      <div className="absolute bottom-0 left-0 h-[15vh] w-full bg-gradient-to-t from-[#0a0f1d] to-[#1c2833]">
        <svg className="absolute bottom-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 100" aria-hidden="true">
          <path d="M0,100 L0,20 Q250,80 500,40 T1000,10 L1000,100 Z" fill="#1C2833" />
          <path d="M0,100 L0,40 Q300,100 600,50 T1000,30 L1000,100 Z" fill="#111822" />
        </svg>
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
      <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-white px-3 py-1 text-sm font-semibold text-[#1C2833] opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        AI 助手
        <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
      </div>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#66CCFF] text-white shadow-[0_4px_20px_rgba(102,204,255,0.15)] transition-all hover:scale-105 hover:bg-[#4DB8FF] shadow-[0_8px_30px_rgba(102,204,255,0.4)]">
        <Sparkles size={28} />
      </div>
    </a>
  );
}

export function ShellContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('relative min-h-screen overflow-hidden bg-[#F0F8FF] font-sans text-[#1C2833]', className)}>{children}</div>;
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
