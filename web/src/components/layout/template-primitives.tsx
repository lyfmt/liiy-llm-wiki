import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Database, FileText, LoaderCircle, MessageSquare, Orbit, RefreshCw, Settings, UploadCloud, X, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getKnowledgeInsertPipeline, getKnowledgeInsertPipelines, retryKnowledgeInsertPipeline, uploadChatAttachment } from '@/lib/api';
import type { ChatAttachmentRef, KnowledgeInsertPipelineState } from '@/lib/types';

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

type FloatingPipelineCard = {
  run_id: string;
  file_name: string;
  attachment: ChatAttachmentRef;
  status: 'starting' | 'retrying' | KnowledgeInsertPipelineState['status'];
  current_stage: KnowledgeInsertPipelineState['currentStage'] | 'queued';
  source_id: string | null;
  error: string | null;
  part_progress?: KnowledgeInsertPipelineState['partProgress'];
};

const knowledgeInsertStages: Array<KnowledgeInsertPipelineState['currentStage']> = [
  'source.uploaded',
  'source.prepared',
  'topics.planned',
  'parts.planned',
  'parts.materialized',
  'parts.extracted',
  'knowledge.connected',
  'graph.prepared',
  'graph.written',
  'wiki.projected',
  'lint.completed'
];

export function GlobalFloatingActions({ chatHref = '/app/ai-chat' }: { chatHref?: string }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pipelines, setPipelines] = useState<FloatingPipelineCard[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function restorePipelines() {
      try {
        const summaries = await getKnowledgeInsertPipelines();
        if (cancelled) return;
        setPipelines(summaries
          .filter((summary) => summary.state.status !== 'done' && (summary.attachment !== null || summary.state.status === 'running'))
          .slice(0, 4)
          .map((summary) => ({
            run_id: summary.run_id,
            file_name: summary.file_name,
            attachment: summary.attachment ?? {
              attachment_id: summary.state.sourceId,
              file_name: summary.file_name,
              mime_type: 'application/octet-stream',
              kind: 'text'
            },
            status: summary.state.status,
            current_stage: summary.state.currentStage,
            source_id: summary.state.sourceId,
            error: summary.state.errors.at(-1) ?? null,
            part_progress: summary.state.partProgress
          })));
      } catch (cause) {
        console.warn('Failed to restore knowledge insert pipelines:', cause);
      }
    }

    void restorePipelines();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pipelines.some((pipeline) => isPipelineActive(pipeline.status))) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      const activePipelines = pipelines.filter((pipeline) => isPipelineActive(pipeline.status));

      await Promise.all(activePipelines.map(async (pipeline) => {
        try {
          const state = await getKnowledgeInsertPipeline(pipeline.run_id);
          if (cancelled) return;
          setPipelines((current) => current.map((item) =>
            item.run_id === pipeline.run_id
              ? {
                  ...item,
                  status: state.status,
                  current_stage: state.currentStage,
                  source_id: state.sourceId,
                  error: state.errors.at(-1) ?? null,
                  part_progress: state.partProgress
                }
              : item
          ));
        } catch (cause) {
          if (cancelled) return;
          setPipelines((current) => current.map((item) =>
            item.run_id === pipeline.run_id
              ? {
                  ...item,
                  error: cause instanceof Error && cause.message.includes('pipeline_not_found')
                    ? '等待流水线状态文件...'
                    : cause instanceof Error
                      ? cause.message
                      : String(cause)
                }
              : item
          ));
        }
      }));
    };

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pipelines]);

  async function handleKnowledgeUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (!files.length || uploading) {
      return;
    }

    setUploading(true);

    try {
      for (const file of files) {
        const result = await uploadChatAttachment({
          fileName: file.name,
          mimeType: file.type || inferMimeTypeFromName(file.name),
          dataBase64: await fileToBase64(file),
          autoKnowledgeInsert: true
        });

        if (result.pipeline_run_id) {
          setPipelines((current) => [
            {
              run_id: result.pipeline_run_id!,
              file_name: file.name,
              attachment: result.attachment,
              status: 'starting',
              current_stage: 'queued',
              source_id: result.pipeline_source_id ?? null,
              error: null
            },
            ...current.filter((item) => item.run_id !== result.pipeline_run_id)
          ]);
        }
      }
    } catch (cause) {
      setPipelines((current) => [
        {
          run_id: `local-upload-error-${Date.now()}`,
          file_name: files[0]?.name ?? '上传文件',
          attachment: {
            attachment_id: 'local-upload-error',
            file_name: files[0]?.name ?? '上传文件',
            mime_type: files[0]?.type || 'application/octet-stream',
            kind: 'text'
          },
          status: 'failed',
          current_stage: 'queued',
          source_id: null,
          error: cause instanceof Error ? cause.message : String(cause)
        },
        ...current
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleRetry(pipeline: FloatingPipelineCard) {
    setPipelines((current) => current.map((item) =>
      item.run_id === pipeline.run_id ? { ...item, status: 'retrying', error: null } : item
    ));

    try {
      const result = await retryKnowledgeInsertPipeline(pipeline.run_id);
      setPipelines((current) => [
        {
          run_id: result.pipeline_run_id,
          file_name: result.attachment.file_name,
          attachment: result.attachment,
          status: 'starting',
          current_stage: 'queued',
          source_id: null,
          error: null
        },
        ...current.filter((item) => item.run_id !== pipeline.run_id && item.run_id !== result.pipeline_run_id)
      ]);
    } catch (cause) {
      setPipelines((current) => current.map((item) =>
        item.run_id === pipeline.run_id
          ? {
              ...item,
              status: 'failed',
              error: cause instanceof Error ? cause.message : String(cause)
            }
          : item
      ));
    }
  }

  function dismissPipeline(runId: string) {
    setPipelines((current) => current.filter((pipeline) => pipeline.run_id !== runId));
  }

  return (
    <>
      <div className="fixed right-5 top-20 z-[70] flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-3 md:right-8">
        {pipelines.slice(0, 4).map((pipeline) => (
          <KnowledgeInsertToast
            key={pipeline.run_id}
            pipeline={pipeline}
            onClose={() => dismissPipeline(pipeline.run_id)}
            onRetry={() => void handleRetry(pipeline)}
            onEnd={() => dismissPipeline(pipeline.run_id)}
          />
        ))}
      </div>

      <div className="fixed bottom-8 right-8 z-[60] flex flex-col items-end gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'group relative flex h-14 w-14 items-center justify-center rounded-[16px] text-white shadow-2xl transition-all',
            uploading ? 'cursor-wait bg-slate-400 shadow-slate-500/20' : 'bg-emerald-500 shadow-emerald-500/25 hover:scale-105 hover:bg-emerald-600'
          )}
          title={uploading ? '正在上传到 Knowledge Insert' : '上传文件到 Knowledge Insert'}
          aria-label={uploading ? '正在上传到 Knowledge Insert' : '上传文件到 Knowledge Insert'}
        >
          <span className="pointer-events-none absolute right-[calc(100%+12px)] whitespace-nowrap rounded-[8px] bg-white px-3 py-1 text-sm font-semibold text-slate-800 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            Knowledge Insert
          </span>
          {uploading ? <LoaderCircle size={24} className="animate-spin" /> : <UploadCloud size={25} />}
        </button>

        <a href={chatHref} className="group relative block cursor-pointer">
          <span className="pointer-events-none absolute right-[calc(100%+12px)] whitespace-nowrap rounded-[8px] bg-white px-3 py-1 text-sm font-semibold text-slate-800 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            AI 助手
          </span>
          <span className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-brand text-white shadow-2xl shadow-blue-500/30 transition-all hover:scale-105 hover:bg-blue-700">
            <MessageSquare size={28} />
          </span>
        </a>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="上传文件到 Knowledge Insert"
        onChange={(event) => void handleKnowledgeUpload(event)}
      />
    </>
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

function KnowledgeInsertToast({
  pipeline,
  onClose,
  onRetry,
  onEnd
}: {
  pipeline: FloatingPipelineCard;
  onClose: () => void;
  onRetry: () => void;
  onEnd: () => void;
}) {
  const terminal = pipeline.status === 'done' || pipeline.status === 'failed' || pipeline.status === 'needs_review';
  const failed = pipeline.status === 'failed' || pipeline.status === 'needs_review';
  const progress = getPipelineProgress(pipeline);

  return (
    <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('truncate text-sm font-bold', failed ? 'text-red-700' : 'text-slate-900')}>
              {buildPipelineHeadline(pipeline)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cn('h-full rounded-full transition-all', failed ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-slate-700">{pipeline.file_name}</div>
          {pipeline.error ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-red-600">{pipeline.error}</div> : null}
          {failed ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                <RefreshCw size={13} />
                重试
              </button>
              <button
                type="button"
                onClick={onEnd}
                className="rounded-[8px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                结束
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {terminal ? (
            failed ? <XCircle size={20} className="text-red-500" /> : <CheckCircle2 size={20} className="text-emerald-500" />
          ) : (
            <LoaderCircle size={20} className="animate-spin text-brand" />
          )}
          <button type="button" onClick={onClose} className="rounded-[8px] p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭流水线状态">
            <X size={17} />
          </button>
        </div>
      </div>
    </div>
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

function isPipelineActive(status: FloatingPipelineCard['status']): boolean {
  return status === 'starting' || status === 'retrying' || status === 'running';
}

function buildPipelineHeadline(pipeline: FloatingPipelineCard): string {
  if (pipeline.status === 'retrying') {
    return '正在重试';
  }

  if (pipeline.status === 'failed') {
    return `报错 · ${pipeline.current_stage}`;
  }

  if (pipeline.status === 'needs_review') {
    return `需要处理 · ${pipeline.current_stage}`;
  }

  if (pipeline.status === 'done') {
    return '完成 · lint.completed';
  }

  const progress = pipeline.part_progress
    ? `${pipeline.part_progress.completed}/${pipeline.part_progress.total}`
    : `${getPipelineProgress(pipeline)}%`;

  return `${pipeline.current_stage} · ${progress}`;
}

function getPipelineProgress(pipeline: FloatingPipelineCard): number {
  if (pipeline.status === 'done') {
    return 100;
  }

  if (pipeline.current_stage === 'queued') {
    return 8;
  }

  const stageIndex = Math.max(0, knowledgeInsertStages.indexOf(pipeline.current_stage));
  const stageBase = (stageIndex / knowledgeInsertStages.length) * 100;

  if (pipeline.part_progress && pipeline.part_progress.total > 0) {
    const stageWidth = 100 / knowledgeInsertStages.length;
    return Math.min(96, Math.round(stageBase + (pipeline.part_progress.completed / pipeline.part_progress.total) * stageWidth));
  }

  if (pipeline.status === 'failed' || pipeline.status === 'needs_review') {
    return Math.max(12, Math.round(stageBase));
  }

  return Math.max(10, Math.min(96, Math.round(stageBase)));
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function inferMimeTypeFromName(fileName: string): string {
  const normalized = fileName.toLowerCase();

  if (normalized.endsWith('.pdf')) return 'application/pdf';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.md')) return 'text/markdown';
  if (normalized.endsWith('.txt')) return 'text/plain';
  if (normalized.endsWith('.json')) return 'application/json';

  return 'application/octet-stream';
}
