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

const textHeading = 'text-[#1C2833]';

const initialAssistantMessage = 'CORE READY. AWAITING MISSION PARAMETERS. I WILL TRACK ALL TOOL EXECUTIONS AND SYNTHESIZE EVIDENCE IN REAL-TIME.';

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
    name: 'MCP (LOCAL & CLOUD)',
    icon: <FileBox size={16} />,
    items: [
      { id: 'mcp_fs', name: 'FILE SYSTEM' },
      { id: 'mcp_state', name: 'RUN STATE' }
    ]
  },
  {
    id: 'skills',
    name: 'SKILLS (EXTENSIONS)',
    icon: <Sparkles size={16} />,
    items: [
      { id: 'skill_review', name: 'REVIEW SUMMARY' },
      { id: 'skill_patch', name: 'PATCH DRAFTS' }
    ]
  },
  {
    id: 'tools',
    name: 'TOOLS (CORE)',
    icon: <Terminal size={16} />,
    items: [
      { id: 'web_search', name: 'WEB SEARCH' },
      { id: 'run_trace', name: 'RUN TRACE' }
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
    if (uploading) return 'UPLOADING...';
    if (submitting) return 'PROCESSING...';
    switch (selectedSession?.session.status) {
      case 'running':
        return 'EXECUTING...';
      case 'needs_review':
        return 'AWAITING REVIEW';
      case 'done':
        return 'COMPLETED';
      case 'failed':
        return 'FAILED';
      default:
        return 'IDLE';
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
        label: 'THINKING...',
        status: 'done',
        details: planDetails
      }
    ];

    run.tool_outcomes.forEach((outcome, index) => {
      steps.push({
        id: `tool-${index}`,
        label: `TOOL CALL: ${outcome.tool_name.toUpperCase()}`,
        status: 'done',
        details: [outcome.summary, outcome.evidence.join('\n'), outcome.touched_files.join('\n')].filter(Boolean).join('\n\n')
      });
    });

    if (run.request_run.status !== 'running') {
      steps.push({
        id: 'formatting',
        label: 'FINALIZING...',
        status: 'done',
        details: run.request_run.result_summary
      });
    }

    return steps;
  }

  return (
    <div className="h-screen overflow-hidden bg-[#FFFFFF] p-6 font-sans">
      <div className="flex h-full gap-6">
        <div className={`w-[300px] shrink-0 overflow-hidden bg-white border-r-4 border-[#1C2833] flex flex-col`}>
          <div className="relative h-[240px] w-full shrink-0 border-b-4 border-[#1C2833]">
            <MagicCircleBackground />
          </div>

          <div className="flex min-h-0 flex-1 flex-col bg-white p-6">
            <h3 className={`mb-1 text-2xl font-bold ${textHeading} shrink-0 uppercase tracking-tighter`}>SYSTEM MONITOR</h3>
            <p className="mb-6 flex shrink-0 items-center gap-2 text-lg font-bold text-[#66CCFF] uppercase">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping bg-[#66CCFF] opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 bg-[#66CCFF]"></span>
              </span>
              STATUS: {selectedStatusText}
            </p>

            <div className="mb-3 flex shrink-0 items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400">MISSION LOG</h4>
              <button
                type="button"
                onClick={() => void handleCreateSession()}
                className="text-xs font-bold text-[#66CCFF] hover:underline uppercase"
              >
                + NEW MISSION
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
                      className={`group w-full border-2 p-3 text-left transition-all ${
                        active
                          ? 'border-[#1C2833] bg-[#F0F8FF] shadow-[2px_2px_0_0_#1C2833]'
                          : 'border-transparent bg-white hover:border-[#1C2833]'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[#1C2833]">
                        <MessageSquare size={16} className="shrink-0 text-[#66CCFF]" />
                        <span className="truncate text-md font-bold uppercase">{session.title || 'UNTITLED MISSION'}</span>
                      </div>
                      <p className="line-clamp-2 pl-6 text-[12px] font-bold text-gray-400 uppercase leading-tight">{session.summary}</p>
                    </button>
                  );
                })
              ) : (
                <div className="border-2 border-dashed border-gray-200 p-3 text-md font-bold text-[#5D6D7E] uppercase">NO LOG RECORDS.</div>
              )}
            </div>

            <div className="mt-auto shrink-0 space-y-6 border-t-2 border-[#1C2833] pt-6">
              <div>
                <div className="mb-1 flex justify-between text-sm font-bold text-[#5D6D7E] uppercase">
                  <span>MEM LOAD</span>
                  <span>{contextLoad}%</span>
                </div>
                <div className="h-3 w-full bg-gray-100 border-2 border-[#1C2833]">
                  <div className="h-full bg-[#66CCFF]" style={{ width: `${contextLoad}%` }}></div>
                </div>
              </div>

              <div>
                <div className="mb-1 flex justify-between text-sm font-bold text-[#5D6D7E] uppercase">
                  <span>TOKEN USAGE</span>
                  <span>{tokenLoad}%</span>
                </div>
                <div className="h-3 w-full bg-gray-100 border-2 border-[#1C2833]">
                  <div className="h-full bg-[#FFB7C5]" style={{ width: `${tokenLoad}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`flex min-w-[400px] flex-1 flex-col overflow-hidden bg-white pixel-border`}>
          <div className="z-10 flex items-center justify-between border-b-4 border-[#1C2833] bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center bg-[#E0F6FF] text-[#1C2833] border-2 border-[#1C2833]">
                <Terminal size={24} />
              </div>
              <h2 className={`text-2xl font-bold ${textHeading} uppercase tracking-tighter`}>OPERATIONS CONSOLE</h2>
            </div>
            <a
              href="/app/discovery"
              className="pixel-button bg-[#FFB7C5] hover:bg-[#FF8A9B]"
              title="EXIT CONSOLE"
            >
              <LogOut size={20} />
            </a>
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto bg-[#F9FCFF] p-8">
            {!selectedSession?.runs.length && !loading && !sessionLoading ? (
              <div className="flex justify-start">
                <div className="flex max-w-[85%] gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center bg-[#66CCFF] text-[#1C2833] border-2 border-[#1C2833]">
                    <Sparkles size={20} />
                  </div>
                  <div className="bg-[#66CCFF] p-4 text-xl font-bold leading-tight text-[#1C2833] border-2 border-[#1C2833] shadow-[4px_4px_0_0_#1C2833]">
                    {initialAssistantMessage.toUpperCase()}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedSession?.runs
              .map((run) => {
                const isLatest = run.request_run.run_id === selectedRun?.request_run.run_id;
                const runToolSteps = getToolSteps(run);
                const runPreviewTitle = run.request_run.intent.toUpperCase() || 'RUN ACCEPTED';
                const runPreviewBody = compactPreviewText(
                  run.result_markdown || run.draft_markdown || run.request_run.result_summary || ''
                );

                return (
                  <div key={run.request_run.run_id} className="space-y-8">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] bg-white p-4 text-xl font-bold leading-tight text-[#1C2833] border-2 border-[#1C2833] shadow-[4px_4px_0_0_#1C2833] uppercase">
                        <div>{run.request_run.user_request}</div>
                        {run.request_run.attachments.length ? (
                          <div className="mt-3 border-t-2 border-[#1C2833] pt-3 text-sm text-[#5D6D7E]">
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
                        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center bg-[#66CCFF] text-[#1C2833] border-2 border-[#1C2833]">
                          <Sparkles size={20} />
                        </div>
                        <div className="flex w-full flex-col gap-4">
                          <div className="w-fit bg-[#66CCFF] p-4 text-xl font-bold leading-tight text-[#1C2833] border-2 border-[#1C2833] shadow-[4px_4px_0_0_#1C2833] uppercase">
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
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center bg-[#66CCFF] text-[#1C2833] border-2 border-[#1C2833]">
                    <Sparkles size={20} />
                  </div>
                  <div className="bg-[#66CCFF] p-4 text-xl font-bold leading-tight text-[#1C2833] border-2 border-[#1C2833]">
                    LOADING MISSION DATA...
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative border-t-4 border-[#1C2833] bg-white p-6">
            {showToolMenu ? <div className="fixed inset-0 z-40" onClick={() => setShowToolMenu(false)}></div> : null}

            <form
              onSubmit={(event) => void handleSend(event)}
              className="relative z-10 flex w-full flex-col border-4 border-[#1C2833] bg-white shadow-[4px_4px_0_0_#1C2833] transition-all focus-within:bg-[#F9FCFF]"
            >
              {showToolMenu ? (
                <div className="absolute bottom-[56px] left-[50px] z-50 flex w-[300px] origin-bottom-left animate-in zoom-in-95 flex-col overflow-hidden border-4 border-[#1C2833] bg-white shadow-[8px_8px_0_0_rgba(0,0,0,0.1)] fade-in">
                  <div className="flex items-center justify-between border-b-4 border-[#1C2833] bg-[#F9FCFF] p-3">
                    <span className="flex items-center gap-2 text-sm font-bold text-[#1C2833] uppercase">
                      <Blocks size={16} className="text-[#66CCFF]" />
                      MODULE CONFIG
                    </span>
                    <button type="button" onClick={() => setShowToolMenu(false)} className="text-[#1C2833] hover:text-[#FFB7C5]">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto">
                    {toolCategories.map((category) => (
                      <div key={category.id} className="last:border-0 border-b-2 border-[#1C2833]">
                        <div
                          className={`flex cursor-pointer items-center justify-between p-3 transition-colors ${expandedCategory === category.id ? 'bg-[#F0F8FF]' : 'hover:bg-gray-50'}`}
                          onClick={() => setExpandedCategory((current) => (current === category.id ? null : category.id))}
                        >
                          <div className="flex items-center gap-2 text-[#1C2833] font-bold">
                            <div className="text-[#1C2833]">{category.icon}</div>
                            <span className="text-sm">{category.name}</span>
                          </div>
                          <ChevronDown size={16} className={`text-[#1C2833] transition-transform duration-200 ${expandedCategory === category.id ? 'rotate-180' : ''}`} />
                        </div>

                        {expandedCategory === category.id ? (
                          <div className="space-y-1 border-t-2 border-[#1C2833] bg-[#F9FCFF] px-2 py-2 shadow-inner">
                            {category.items.map((item) => {
                              const isActive = activeTools.includes(item.id);
                              return (
                                <div
                                  key={item.id}
                                  className="flex cursor-pointer items-center justify-between p-2 hover:bg-white"
                                  onClick={() => toggleTool(item.id)}
                                >
                                  <span className="text-[14px] font-bold text-[#5D6D7E] uppercase">{item.name}</span>
                                  <div className={`flex h-4 w-8 items-center border-2 border-[#1C2833] p-[2px] transition-colors duration-300 ${isActive ? 'bg-[#66CCFF]' : 'bg-gray-200'}`}>
                                    <div className={`h-2 w-2 transform bg-[#1C2833] transition-transform duration-300 ${isActive ? 'translate-x-4' : 'translate-x-0'}`}></div>
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
                className="absolute right-3 top-3 z-20 bg-white p-1 text-[#1C2833] border-2 border-[#1C2833] hover:bg-[#F0F8FF]"
                title={isExpanded ? 'COLLAPSE' : 'EXPAND'}
              >
                {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="INPUT COMMAND... (SHIFT + ENTER FOR NEWLINE)"
                className={`w-full resize-y bg-transparent p-4 pr-12 text-2xl font-bold leading-tight text-[#1C2833] placeholder-gray-400 focus:outline-none uppercase ${isExpanded ? 'min-h-[160px]' : 'min-h-[64px] max-h-[400px]'}`}
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />

              {pendingAttachments.length ? (
                <div className="flex flex-wrap gap-2 border-t-2 border-[#1C2833] px-3 py-2">
                  {pendingAttachments.map((attachment) => (
                    <div
                      key={attachment.attachment_id}
                      className="border-2 border-[#1C2833] bg-[#F9FCFF] px-2 py-1 text-xs font-bold uppercase text-[#1C2833]"
                    >
                      {attachment.file_name}
                    </div>
                  ))}
                </div>
              ) : null}

              {knowledgeInsertPipelines.length ? (
                <KnowledgeInsertPipelinePanel pipelines={knowledgeInsertPipelines.slice(0, 4)} />
              ) : null}

              <div className="flex items-center justify-between px-3 pb-3 pt-1 border-t-2 border-[#1C2833]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-[#1C2833] hover:bg-[#F0F8FF] border-2 border-transparent hover:border-[#1C2833]"
                    title="ATTACH FILE"
                  >
                    <Paperclip size={20} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowToolMenu((current) => !current)}
                    className={`p-2 border-2 ${showToolMenu ? 'bg-[#E0F6FF] border-[#1C2833]' : 'border-transparent hover:border-[#1C2833] hover:bg-[#F0F8FF]'}`}
                    title="MODULES"
                  >
                    <div className="relative">
                      <Blocks size={20} />
                      {activeTools.length ? <span className="absolute -right-1 -top-1 h-3 w-3 bg-[#FFB7C5] border-2 border-[#1C2833]"></span> : null}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!input.trim() || submitting || uploading}
                    className={`pixel-button text-xl px-6 py-2 ${
                      input.trim() && !submitting && !uploading
                        ? 'bg-[#66CCFF]'
                        : 'opacity-50 grayscale cursor-not-allowed'
                    }`}
                  >
                    EXECUTE <Send size={20} className="ml-2 inline" />
                  </button>
                </div>
              </div>
            </form>
            <input
              ref={fileInputRef}
              type="file"
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
    <div className="border-t-2 border-[#1C2833] bg-[#F9FCFF] px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5D6D7E]">
        <Brain size={14} className="text-[#66CCFF]" />
        Knowledge Insert Pipeline
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {pipelines.map((pipeline) => {
          const progress = pipeline.part_progress
            ? `${pipeline.part_progress.completed}/${pipeline.part_progress.total} parts`
            : pipeline.source_id || pipeline.error || 'waiting for state';

          return (
            <div key={pipeline.run_id} className="border-2 border-[#1C2833] bg-white px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-bold text-[#1C2833]">{pipeline.file_name}</span>
                <span className="shrink-0 rounded bg-[#E0F6FF] px-2 py-0.5 font-bold uppercase text-[#1C2833]">
                  {pipeline.status}
                </span>
              </div>
              <div className="mt-1 truncate font-bold uppercase text-[#5D6D7E]">
                {pipeline.current_stage}
              </div>
              <div className="mt-1 truncate text-[#5D6D7E]">{progress}</div>
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
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#1a2980] to-[#66CCFF]">
      <div className="absolute h-48 w-48 animate-[spin_10s_linear_infinite] border-4 border-[#FFB7C5]/30"></div>
      <div className="absolute h-32 w-32 animate-[spin_15s_linear_infinite_reverse] border-2 border-dashed border-white/50"></div>
      <div className="absolute h-20 w-20 animate-[spin_5s_linear_infinite] border-4 border-[#66CCFF]/60"></div>
      <div className="relative z-10 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]">
        <Brain size={80} strokeWidth={1.5} />
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
        className={`flex w-fit items-center gap-3 border-2 px-3 py-2 text-md font-bold transition-all uppercase ${
          hasDetails ? 'cursor-pointer hover:bg-white border-[#1C2833]' : 'text-gray-400 border-gray-200'
        } ${isOpen ? 'bg-white shadow-[2px_2px_0_0_#1C2833]' : 'bg-transparent'}`}
        onClick={() => (hasDetails ? setIsOpen((current) => !current) : undefined)}
      >
        {hasDetails ? (
          <ChevronRightIcon size={18} className={`transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        ) : (
          <div className="w-[18px]"></div>
        )}
        <span className="font-mono tracking-tighter">{step.label}</span>
        {step.status === 'done' ? <CheckCircle2 size={16} className="ml-2 text-[#66CCFF]" /> : null}
      </div>

      {isOpen && hasDetails ? (
        <div className="animate-in slide-in-from-top-1 fade-in ml-10 mr-2 overflow-x-auto border-2 border-[#1C2833] bg-white p-4 font-mono text-sm text-[#1C2833] shadow-[2px_2px_0_0_#1C2833] duration-200 whitespace-pre-wrap uppercase leading-tight">
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
    <div className="mt-2 max-w-[600px] bg-white border-4 border-[#1C2833] shadow-[6px_6px_0_0_#1C2833] animate-in slide-in-from-bottom-2 self-start transform transition-all">
      <div className="flex items-center gap-3 border-b-2 border-[#1C2833] bg-[#F9FCFF] px-4 py-3">
        <FileText className="text-[#1C2833]" size={20} />
        <span className="text-sm font-bold uppercase tracking-widest text-[#1C2833]">SYSTEM OUTPUT PREVIEW</span>
      </div>

      <div className="min-h-[120px] p-6 text-[#1C2833]">
        <h1 className="mb-4 text-3xl font-extrabold uppercase tracking-tighter">{title}</h1>
        <p className="border-l-4 border-[#66CCFF] py-2 pl-4 text-xl font-bold leading-tight uppercase text-[#5D6D7E]">{content}</p>
        <div className="mt-8 flex h-32 w-full items-center justify-center border-2 border-[#1C2833] bg-[#F0F8FF] grayscale opacity-30">
          <ImageIcon size={48} />
        </div>
      </div>

      <div className={`grid ${uiState.actions.length > 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-2 border-t-2 border-[#1C2833] p-4 bg-gray-50`}>
        {uiState.actions.map((action, index) => {
          let bgColor = 'bg-white';
          if (action.kind === 'approve') bgColor = 'bg-[#66CCFF]';
          if (action.kind === 'retry' || action.kind === 'clarify') bgColor = 'bg-[#FFB7C5]';

          return (
            <button
              key={index}
              type="button"
              onClick={() => onAction(action.prompt || action.label)}
              className={`pixel-button ${bgColor} text-lg uppercase ${uiState.actions.length === 3 && index === 2 ? 'col-span-2' : ''}`}
            >
              [{index + 1}] {action.label}
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
