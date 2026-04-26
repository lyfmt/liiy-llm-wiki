import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import {
  Blocks,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  FileBox,
  FileText,
  Image as ImageIcon,
  LogOut,
  Maximize2,
  MessageSquare,
  Minimize2,
  Paperclip,
  Send,
  Sparkles,
  Terminal,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  getChatRunUi,
  getChatSession,
  getChatSessions,
  getKnowledgeInsertPipeline,
  createChatSession,
  startChatRun,
  uploadChatAttachment
} from '@/lib/api';
import type {
  ChatAttachmentRef,
  ChatRunUiState,
  ChatSessionDetail,
  ChatSessionSummary,
  KnowledgeInsertPipelineState,
  RunDetailResponse
} from '@/lib/types';

const textHeading = 'text-slate-900';

const initialAssistantMessage = '我在这里。可以直接提问，也可以上传资料，我会把附件写入 Knowledge Insert 流水线并持续更新状态。';

type ToolStep = {
  id: string;
  label: string;
  status: 'done';
  details?: string;
};

type ToolCategory = {
  id: string;
  name: string;
  icon: ReactNode;
  items: Array<{
    id: string;
    name: string;
  }>;
};

type PendingKnowledgeInsertPipeline = {
  run_id: string;
  file_name: string;
  status: 'starting' | KnowledgeInsertPipelineState['status'];
  current_stage: KnowledgeInsertPipelineState['currentStage'] | 'queued';
  source_id: string | null;
  error: string | null;
  part_progress?: KnowledgeInsertPipelineState['partProgress'];
};

const toolCategories: ToolCategory[] = [
  {
    id: 'mcp',
    name: 'MCP',
    icon: <FileBox size={16} />,
    items: [
      { id: 'mcp_fs', name: '文件系统' },
      { id: 'mcp_state', name: '运行状态' }
    ]
  },
  {
    id: 'skills',
    name: '技能',
    icon: <Sparkles size={16} />,
    items: [
      { id: 'skill_review', name: '审查摘要' },
      { id: 'skill_patch', name: '补丁草稿' }
    ]
  },
  {
    id: 'tools',
    name: '工具',
    icon: <Terminal size={16} />,
    items: [
      { id: 'web_search', name: '网页搜索' },
      { id: 'run_trace', name: '运行追踪' }
    ]
  }
];

export function AiChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSessionId = searchParams.get('session') || searchParams.get('sessionId');
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSessionDetail | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunDetailResponse | null>(null);
  const [uiState, setUiState] = useState<ChatRunUiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [input, setInput] = useState('');
  const [, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showToolMenu, setShowToolMenu] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<string[]>(['web_search', 'mcp_fs']);
  const [pendingAttachments, setPendingAttachments] = useState<Array<ChatAttachmentRef & { session_id: string }>>([]);
  const [knowledgeInsertPipelines, setKnowledgeInsertPipelines] = useState<PendingKnowledgeInsertPipeline[]>([]);

  async function loadSessions() {
    const value = await getChatSessions();
    setSessions(value);
    return value;
  }

  function updateSelectedSessionId(sessionId: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('session', sessionId);
      next.delete('run');
      next.delete('sessionId');
      return next;
    });
  }

  async function loadSessionDetail(sessionId: string, options?: { syncUrl?: boolean }) {
    setSessionLoading(true);
    setError(null);
    try {
      const detail = await getChatSession(sessionId);
      setSelectedSession(detail);
      const latestRun =
        detail.runs.find((r) => r.request_run.run_id === detail.session.last_run_id) ||
        detail.runs[detail.runs.length - 1] ||
        null;
      setSelectedRun(latestRun);

      if (latestRun) {
        try {
          const ui = await getChatRunUi(latestRun.request_run.run_id);
          setUiState(ui);
        } catch (e) {
          console.warn('Failed to load UI state:', e);
          setUiState(null);
        }
      } else {
        setUiState(null);
      }

      if (options?.syncUrl !== false) {
        updateSelectedSessionId(sessionId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleCreateSession() {
    try {
      const newSession = await createChatSession();
      await loadSessions();
      await loadSessionDetail(newSession.session_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    async function initialize() {
      setLoading(true);
      setError(null);
      try {
        const items = await loadSessions();
        const initialSessionId = selectedSessionId ?? items[0]?.session_id ?? null;
        if (initialSessionId) {
          await loadSessionDetail(initialSessionId, { syncUrl: !selectedSessionId });
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    }

    void initialize();
  }, []);

  useEffect(() => {
    if (!selectedSessionId || loading || sessionLoading || selectedSession?.session.session_id === selectedSessionId) {
      return;
    }
    void loadSessionDetail(selectedSessionId, { syncUrl: false });
  }, [loading, sessionLoading, selectedSession, selectedSessionId]);

  useEffect(() => {
    setPendingAttachments((current) => current.filter((attachment) => attachment.session_id === selectedSessionId));
  }, [selectedSessionId]);

  useEffect(() => {
    if (!knowledgeInsertPipelines.some((pipeline) => pipeline.status === 'starting' || pipeline.status === 'running')) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      const activePipelines = knowledgeInsertPipelines.filter(
        (pipeline) => pipeline.status === 'starting' || pipeline.status === 'running'
      );

      await Promise.all(activePipelines.map(async (pipeline) => {
        try {
          const state = await getKnowledgeInsertPipeline(pipeline.run_id);
          if (cancelled) return;
          setKnowledgeInsertPipelines((current) => current.map((item) =>
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
          setKnowledgeInsertPipelines((current) => current.map((item) =>
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
  }, [knowledgeInsertPipelines]);

  useEffect(() => {
    if (!selectedSessionId || selectedSession?.session.status !== 'running') {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const [detail] = await Promise.all([getChatSession(selectedSessionId), loadSessions()]);
        setSelectedSession(detail);
        const latestRun =
          detail.runs.find((r) => r.request_run.run_id === detail.session.last_run_id) ||
          detail.runs[detail.runs.length - 1] ||
          null;
        setSelectedRun(latestRun);
        if (latestRun) {
          const ui = await getChatRunUi(latestRun.request_run.run_id);
          setUiState(ui);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [selectedSessionId, selectedSession?.session.status]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    const nextHeight = isExpanded ? Math.max(element.scrollHeight, 160) : Math.min(element.scrollHeight, 300);
    element.style.height = `${nextHeight}px`;
  }, [input, isExpanded]);

  function toggleTool(id: string) {
    setActiveTools((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (!files.length || uploading) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const uploaded: Array<ChatAttachmentRef & { session_id: string }> = [];

      for (const file of files) {
        const result = await uploadChatAttachment({
          sessionId: selectedSessionId || undefined,
          fileName: file.name,
          mimeType: file.type || inferMimeTypeFromName(file.name),
          dataBase64: await fileToBase64(file),
          autoKnowledgeInsert: true
        });

        uploaded.push({
          ...result.attachment,
          session_id: result.session_id
        });

        if (result.pipeline_run_id) {
          setKnowledgeInsertPipelines((current) => [
            {
              run_id: result.pipeline_run_id!,
              file_name: file.name,
              status: 'starting',
              current_stage: 'queued',
              source_id: result.pipeline_source_id ?? null,
              error: null
            },
            ...current.filter((item) => item.run_id !== result.pipeline_run_id)
          ]);
        }

        if (!selectedSessionId || selectedSessionId !== result.session_id) {
          await loadSessions();
          await loadSessionDetail(result.session_id, { syncUrl: true });
        }
      }

      setPendingAttachments((current) => [...current, ...uploaded]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleSend(event?: FormEvent<HTMLFormElement>, customInput?: string) {
    event?.preventDefault();
    const prompt = (customInput ?? input).trim();
    if (!prompt || submitting || uploading) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await startChatRun(
        prompt,
        selectedSessionId || undefined,
        pendingAttachments.map((attachment) => attachment.attachment_id)
      );

      if (!result.run_id) {
        setSelectedRun(null);
        return;
      }

      setInput('');
      setPendingAttachments([]);
      setIsExpanded(false);
      await loadSessions();
      await loadSessionDetail(result.session_id || selectedSessionId || '', { syncUrl: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedStatusText = useMemo(() => {
    if (uploading) return '上传中';
    if (submitting) return '处理中';
    switch (selectedSession?.session.status) {
      case 'running':
        return '运行中';
      case 'needs_review':
        return '等待确认';
      case 'done':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return '待命';
    }
  }, [selectedSession, submitting, uploading]);

  const contextLoad = useMemo(() => {
    const count = selectedRun?.events.length ?? 0;
    return Math.max(12, Math.min(100, count * 8));
  }, [selectedRun]);

  const tokenLoad = useMemo(() => {
    const count = selectedRun?.tool_outcomes.length ?? 0;
    return Math.max(18, Math.min(100, count * 24));
  }, [selectedRun]);

  function getToolSteps(run: RunDetailResponse | null): ToolStep[] {
    if (!run) return [];

    const planDetails = run.request_run.plan.length
      ? run.request_run.plan.map((step, index) => `${index + 1}. ${step}`).join('\n')
      : run.request_run.intent;

    const steps: ToolStep[] = [
      {
        id: 'thinking',
        label: '思考与规划',
        status: 'done',
        details: planDetails
      }
    ];

    run.tool_outcomes.forEach((outcome, index) => {
      steps.push({
        id: `tool-${index}`,
        label: `工具调用：${outcome.tool_name}`,
        status: 'done',
        details: [outcome.summary, outcome.evidence.join('\n'), outcome.touched_files.join('\n')].filter(Boolean).join('\n\n')
      });
    });

    if (run.request_run.status !== 'running') {
      steps.push({
        id: 'formatting',
        label: '整理回答',
        status: 'done',
        details: run.request_run.result_summary
      });
    }

    return steps;
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 p-4 font-sans text-slate-900 md:p-6">
      <div className="flex h-full gap-4 md:gap-6">
        <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-sm">
          <div className="relative h-[190px] w-full shrink-0 border-b border-slate-100">
            <MagicCircleBackground />
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-white p-6">
            <h3 className={`mb-1 shrink-0 text-xl font-bold ${textHeading}`}>会话与状态</h3>
            <p className="mb-6 flex shrink-0 items-center gap-2 text-sm font-semibold text-brand">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-brand"></span>
              </span>
              {selectedStatusText}
            </p>

            <div className="mb-3 flex shrink-0 items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Sessions</h4>
              <button
                type="button"
                onClick={() => void handleCreateSession()}
                className="rounded-[8px] px-2 py-1 text-xs font-semibold text-brand hover:bg-blue-50"
              >
                新建
              </button>
            </div>
            <div className="mb-6 min-h-[120px] flex-1 space-y-3 overflow-y-auto pr-1">
              {sessions.length ? (
                sessions.map((session) => {
                  const active = selectedSessionId === session.session_id;
                  return (
                    <button
                      key={session.session_id}
                      type="button"
                      onClick={() => void loadSessionDetail(session.session_id)}
                      className={`group w-full rounded-[8px] border p-3 text-left transition-colors ${
                        active
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-slate-900">
                        <MessageSquare size={16} className="shrink-0 text-brand" />
                        <span className="truncate text-sm font-bold">{session.title || '未命名会话'}</span>
                      </div>
                      <p className="line-clamp-2 pl-6 text-xs leading-relaxed text-slate-500">{session.summary}</p>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[8px] border border-dashed border-slate-200 p-3 text-sm text-slate-500">还没有会话记录。</div>
              )}
            </div>

            <div className="mt-auto shrink-0 space-y-5 border-t border-slate-100 pt-5">
              <div>
                <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                  <span>上下文</span>
                  <span>{contextLoad}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${contextLoad}%` }}></div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                  <span>工具使用</span>
                  <span>{tokenLoad}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-sky-300" style={{ width: `${tokenLoad}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-[400px] flex-1 flex-col overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-sm">
          <div className="z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-blue-50 text-brand">
                <Terminal size={24} />
              </div>
              <h2 className={`text-2xl font-bold ${textHeading}`}>AI 助手</h2>
            </div>
            <a
              href="/app"
              className="rounded-[8px] border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-brand"
              title="返回主页"
            >
              <LogOut size={20} />
            </a>
          </div>

          <div className="flex-1 space-y-7 overflow-y-auto bg-slate-50/70 p-6 md:p-8">
            {!selectedSession?.runs.length && !loading && !sessionLoading ? (
              <div className="flex justify-start">
                <div className="flex max-w-[85%] gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-brand text-white">
                    <Sparkles size={20} />
                  </div>
                  <div className="rounded-[8px] bg-white p-4 text-base font-medium leading-7 text-slate-700 shadow-sm ring-1 ring-slate-100">
                    {initialAssistantMessage}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedSession?.runs
              .map((run) => {
                const isLatest = run.request_run.run_id === selectedRun?.request_run.run_id;
                const runToolSteps = getToolSteps(run);
                const runPreviewTitle = run.request_run.intent || '已收到请求';
                const runPreviewBody = compactPreviewText(
                  run.result_markdown || run.draft_markdown || run.request_run.result_summary || ''
                );

                return (
                  <div key={run.request_run.run_id} className="space-y-8">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-[8px] bg-brand px-4 py-3 text-base font-medium leading-7 text-white shadow-sm">
                        <div>{run.request_run.user_request}</div>
                        {run.request_run.attachments.length ? (
                          <div className="mt-3 border-t border-white/25 pt-3 text-sm text-blue-50">
                            {run.request_run.attachments.map((attachment) => (
                              <div key={attachment.attachment_id}>{attachment.file_name}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {runToolSteps.length ? (
                      <div className="flex w-full justify-start">
                        <div className="flex w-full flex-col py-1 pl-14">
                          {runToolSteps.map((step) => (
                            <ToolStepItem key={step.id} step={step} />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex justify-start">
                      <div className="flex max-w-[85%] gap-4">
                        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-brand text-white">
                          <Sparkles size={20} />
                        </div>
                        <div className="flex w-full flex-col gap-4">
                          <div className="w-fit rounded-[8px] bg-white p-4 text-base font-medium leading-7 text-slate-700 shadow-sm ring-1 ring-slate-100">
                            {run.request_run.result_summary}
                          </div>
                          {isLatest && uiState && (
                            <PreviewCard
                              title={runPreviewTitle}
                              content={runPreviewBody || run.request_run.result_summary}
                              uiState={uiState}
                              onAction={(prompt) => void handleSend(undefined, prompt)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

            {sessionLoading && !selectedSession ? (
              <div className="flex justify-start">
                <div className="flex max-w-[85%] gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-brand text-white">
                    <Sparkles size={20} />
                  </div>
                  <div className="rounded-[8px] bg-white p-4 text-base font-medium leading-7 text-slate-700 shadow-sm ring-1 ring-slate-100">
                    正在加载会话…
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative border-t border-slate-100 bg-white p-5">
            {showToolMenu ? <div className="fixed inset-0 z-40" onClick={() => setShowToolMenu(false)}></div> : null}

            <form
              onSubmit={(event) => void handleSend(event)}
              className="relative z-10 flex w-full flex-col rounded-[8px] border border-slate-200 bg-white shadow-sm transition-colors focus-within:border-blue-200 focus-within:bg-blue-50/20"
            >
              {showToolMenu ? (
                <div className="absolute bottom-[56px] left-[50px] z-50 flex w-[300px] origin-bottom-left animate-in zoom-in-95 flex-col overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-xl fade-in">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-3">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Blocks size={16} className="text-brand" />
                      工具模块
                    </span>
                    <button type="button" onClick={() => setShowToolMenu(false)} className="text-slate-500 hover:text-slate-900">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto">
                    {toolCategories.map((category) => (
                      <div key={category.id} className="border-b border-slate-100 last:border-0">
                        <div
                          className={`flex cursor-pointer items-center justify-between p-3 transition-colors ${expandedCategory === category.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                          onClick={() => setExpandedCategory((current) => (current === category.id ? null : category.id))}
                        >
                          <div className="flex items-center gap-2 font-bold text-slate-900">
                            <div className="text-slate-500">{category.icon}</div>
                            <span className="text-sm">{category.name}</span>
                          </div>
                          <ChevronDown size={16} className={`text-slate-500 transition-transform duration-200 ${expandedCategory === category.id ? 'rotate-180' : ''}`} />
                        </div>

                        {expandedCategory === category.id ? (
                          <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-2 py-2">
                            {category.items.map((item) => {
                              const isActive = activeTools.includes(item.id);
                              return (
                                <div
                                  key={item.id}
                                  className="flex cursor-pointer items-center justify-between rounded-[8px] p-2 hover:bg-white"
                                  onClick={() => toggleTool(item.id)}
                                >
                                  <span className="text-sm font-semibold text-slate-600">{item.name}</span>
                                  <div className={`flex h-5 w-9 items-center rounded-full p-[2px] transition-colors duration-300 ${isActive ? 'bg-brand' : 'bg-slate-200'}`}>
                                    <div className={`h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
                className="absolute right-3 top-3 z-20 rounded-[8px] bg-white p-1 text-slate-500 hover:bg-blue-50 hover:text-brand"
                title={isExpanded ? '收起' : '展开'}
              >
                {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>

              <textarea
                ref={textareaRef}
                name="chat_prompt"
                aria-label="输入问题"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入问题，Shift + Enter 换行"
                className={`w-full resize-y bg-transparent p-4 pr-12 text-base leading-7 text-slate-900 placeholder-slate-400 focus:outline-none ${isExpanded ? 'min-h-[160px]' : 'min-h-[64px] max-h-[400px]'}`}
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />

              {pendingAttachments.length ? (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2">
                  {pendingAttachments.map((attachment) => (
                    <div
                      key={attachment.attachment_id}
                      className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-slate-700"
                    >
                      {attachment.file_name}
                    </div>
                  ))}
                </div>
              ) : null}

              {knowledgeInsertPipelines.length ? (
                <KnowledgeInsertPipelinePanel pipelines={knowledgeInsertPipelines.slice(0, 4)} />
              ) : null}

              <div className="flex items-center justify-between border-t border-slate-100 px-3 pb-3 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-[8px] p-2 text-slate-500 hover:bg-blue-50 hover:text-brand"
                    title="上传附件"
                  >
                    <Paperclip size={20} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowToolMenu((current) => !current)}
                    className={`rounded-[8px] p-2 transition-colors ${showToolMenu ? 'bg-blue-50 text-brand' : 'text-slate-500 hover:bg-blue-50 hover:text-brand'}`}
                    title="工具模块"
                  >
                    <div className="relative">
                      <Blocks size={20} />
                      {activeTools.length ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-sky-300 ring-2 ring-white"></span> : null}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!input.trim() || submitting || uploading}
                    className={`inline-flex items-center gap-2 rounded-[8px] px-5 py-2.5 text-sm font-bold text-white transition-colors ${
                      input.trim() && !submitting && !uploading
                        ? 'bg-brand hover:bg-blue-700'
                        : 'cursor-not-allowed bg-slate-300'
                    }`}
                  >
                    发送 <Send size={18} />
                  </button>
                </div>
              </div>
            </form>
            <input
              ref={fileInputRef}
              type="file"
              name="attachments"
              aria-label="上传附件"
              multiple
              className="hidden"
              onChange={(event) => void handleFileSelection(event)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function KnowledgeInsertPipelinePanel({ pipelines }: { pipelines: PendingKnowledgeInsertPipeline[] }) {
  return (
    <div className="border-t border-slate-100 bg-blue-50/40 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        <Brain size={14} className="text-brand" />
        Knowledge Insert Pipeline
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {pipelines.map((pipeline) => {
          const progress = pipeline.part_progress
            ? `${pipeline.part_progress.completed}/${pipeline.part_progress.total} parts`
            : pipeline.source_id || pipeline.error || 'waiting for state';

          return (
            <div key={pipeline.run_id} className="rounded-[8px] border border-blue-100 bg-white px-3 py-2 text-xs shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-bold text-slate-900">{pipeline.file_name}</span>
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 font-bold uppercase text-brand">
                  {pipeline.status}
                </span>
              </div>
              <div className="mt-1 truncate font-semibold text-slate-600">
                {pipeline.current_stage}
              </div>
              <div className="mt-1 truncate text-slate-500">{progress}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
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

function MagicCircleBackground() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#dff1ff_0,#f8fbff_48%,#ffffff_100%)]">
      <div className="absolute h-36 w-36 rounded-full border border-blue-200"></div>
      <div className="absolute h-24 w-24 rounded-[8px] border border-blue-100 bg-white/60 shadow-sm"></div>
      <div className="relative z-10 text-brand">
        <Brain size={70} strokeWidth={1.5} />
      </div>
    </div>
  );
}

function ToolStepItem({ step }: { step: ToolStep }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasDetails = Boolean(step.details);

  return (
    <div className="mb-2 flex max-w-[90%] flex-col gap-1">
      <div
        className={`flex w-fit items-center gap-3 rounded-[8px] border px-3 py-2 text-sm font-semibold transition-colors ${
          hasDetails ? 'cursor-pointer border-slate-200 text-slate-700 hover:bg-white' : 'border-slate-100 text-slate-400'
        } ${isOpen ? 'bg-white shadow-sm' : 'bg-transparent'}`}
        onClick={() => (hasDetails ? setIsOpen((current) => !current) : undefined)}
      >
        {hasDetails ? (
          <ChevronRightIcon size={18} className={`transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        ) : (
          <div className="w-[18px]"></div>
        )}
        <span>{step.label}</span>
        {step.status === 'done' ? <CheckCircle2 size={16} className="ml-2 text-brand" /> : null}
      </div>

      {isOpen && hasDetails ? (
        <div className="animate-in slide-in-from-top-1 fade-in ml-10 mr-2 overflow-x-auto rounded-[8px] border border-slate-200 bg-white p-4 font-mono text-sm leading-6 text-slate-700 shadow-sm duration-200 whitespace-pre-wrap">
          {step.details}
        </div>
      ) : null}
    </div>
  );
}

function PreviewCard({
  title,
  content,
  uiState,
  onAction
}: {
  title: string;
  content: string;
  uiState: ChatRunUiState | null;
  onAction: (prompt: string) => void;
}) {
  if (!uiState || !uiState.actions.length) return null;

  return (
    <div className="mt-2 max-w-[600px] animate-in slide-in-from-bottom-2 self-start overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-sm transition-all">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <FileText className="text-brand" size={20} />
        <span className="text-sm font-bold text-slate-700">输出预览</span>
      </div>

      <div className="min-h-[120px] p-6 text-slate-900">
        <h1 className="mb-4 text-2xl font-bold leading-tight">{title}</h1>
        <p className="border-l-4 border-brand py-2 pl-4 text-base font-medium leading-7 text-slate-600">{content}</p>
        <div className="mt-8 flex h-32 w-full items-center justify-center rounded-[8px] border border-blue-100 bg-blue-50 text-brand opacity-70">
          <ImageIcon size={48} />
        </div>
      </div>

      <div className={`grid ${uiState.actions.length > 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-2 border-t border-slate-100 bg-slate-50 p-4`}>
        {uiState.actions.map((action, index) => {
          let className = 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50';
          if (action.kind === 'approve') className = 'bg-brand text-white hover:bg-blue-700';
          if (action.kind === 'retry' || action.kind === 'clarify') className = 'border border-blue-100 bg-blue-50 text-brand hover:bg-blue-100';

          return (
            <button
              key={index}
              type="button"
              onClick={() => onAction(action.prompt || action.label)}
              className={`rounded-[8px] px-4 py-2.5 text-sm font-bold transition-colors ${className} ${uiState.actions.length === 3 && index === 2 ? 'col-span-2' : ''}`}
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function compactPreviewText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[>*_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}
