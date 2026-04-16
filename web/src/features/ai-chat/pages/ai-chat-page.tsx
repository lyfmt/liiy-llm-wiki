import type { FormEvent, ReactNode } from 'react';
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

import { getRun, getRuns, startChatRun } from '@/lib/api';
import type { ChatRunStartResponse, RunDetailResponse, RunSummary } from '@/lib/types';

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
  const selectedRunId = searchParams.get('run');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [input, setInput] = useState('');
  const [, setError] = useState<string | null>(null);
  const [responseState, setResponseState] = useState<ChatRunStartResponse | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showToolMenu, setShowToolMenu] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<string[]>(['web_search', 'mcp_fs']);

  async function loadRuns() {
    const value = await getRuns();
    setRuns(value);
    return value;
  }

  function updateSelectedRunId(runId: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('run', runId);
      return next;
    });
  }

  async function loadRunDetail(runId: string, options?: { syncUrl?: boolean }) {
    setRunLoading(true);
    setError(null);
    try {
      const detail = await getRun(runId);
      setSelectedRun(detail);
      if (options?.syncUrl !== false) {
        updateSelectedRunId(runId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunLoading(false);
    }
  }

  useEffect(() => {
    async function initialize() {
      setLoading(true);
      setError(null);
      try {
        const items = await loadRuns();
        const initialRunId = selectedRunId ?? items[0]?.run_id ?? null;
        if (initialRunId) {
          await loadRunDetail(initialRunId, { syncUrl: !selectedRunId });
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
    if (!selectedRunId || loading || runLoading || selectedRun?.request_run.run_id === selectedRunId) {
      return;
    }
    void loadRunDetail(selectedRunId, { syncUrl: false });
  }, [loading, runLoading, selectedRun, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId || selectedRun?.request_run.status !== 'running') {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const [detail] = await Promise.all([getRun(selectedRunId), loadRuns()]);
        setSelectedRun(detail);
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [selectedRunId, selectedRun?.request_run.status]);

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

  function queuePrompt(prompt: string) {
    setInput(prompt);
    setShowToolMenu(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function handleSend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!input.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    setResponseState(null);

    try {
      const prompt = input.trim();
      const result = await startChatRun(prompt);
      setResponseState(result);

      if (!result.run_id) {
        setSelectedRun(null);
        return;
      }

      setInput('');
      setIsExpanded(false);
      await loadRuns();
      await loadRunDetail(result.run_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedStatusText = useMemo(() => {
    if (submitting) return 'PROCESSING...';
    switch (selectedRun?.request_run.status) {
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
  }, [selectedRun, submitting]);

  const contextLoad = useMemo(() => {
    const count = selectedRun?.events.length ?? 0;
    return Math.max(12, Math.min(100, count * 8));
  }, [selectedRun]);

  const tokenLoad = useMemo(() => {
    const count = selectedRun?.tool_outcomes.length ?? 0;
    return Math.max(18, Math.min(100, count * 24));
  }, [selectedRun]);

  const toolSteps = useMemo<ToolStep[]>(() => {
    if (!selectedRun) return [];

    const planDetails = selectedRun.request_run.plan.length
      ? selectedRun.request_run.plan.map((step, index) => `${index + 1}. ${step}`).join('\n')
      : selectedRun.request_run.intent;

    const steps: ToolStep[] = [
      {
        id: 'thinking',
        label: 'THINKING...',
        status: 'done',
        details: planDetails
      }
    ];

    selectedRun.tool_outcomes.forEach((outcome, index) => {
      steps.push({
        id: `tool-${index}`,
        label: `TOOL CALL: ${outcome.tool_name.toUpperCase()}`,
        status: 'done',
        details: [outcome.summary, outcome.evidence.join('\n'), outcome.touched_files.join('\n')].filter(Boolean).join('\n\n')
      });
    });

    if (selectedRun.request_run.status !== 'running') {
      steps.push({
        id: 'formatting',
        label: 'FINALIZING...',
        status: 'done',
        details: selectedRun.request_run.result_summary
      });
    }

    return steps;
  }, [selectedRun]);

  const previewTitle = selectedRun?.request_run.intent.toUpperCase() ?? (responseState?.ok ? responseState.intent.toUpperCase() : null) ?? 'RUN ACCEPTED';
  const previewBody = useMemo(() => {
    const source = selectedRun?.result_markdown || selectedRun?.draft_markdown || selectedRun?.request_run.result_summary || responseState?.result_summary || '';
    return compactPreviewText(source);
  }, [responseState, selectedRun]);

  const selectedRunSummary = selectedRun?.request_run.result_summary ?? initialAssistantMessage;

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

            <div className="mb-6 min-h-[120px] flex-1 space-y-3 overflow-y-auto pr-1">
              <h4 className="mb-3 text-sm font-bold uppercase tracking-widest text-gray-400">MISSION LOG</h4>
              {runs.length ? (
                runs.map((run) => {
                  const active = selectedRunId === run.run_id || (!selectedRunId && selectedRun?.request_run.run_id === run.run_id);
                  return (
                    <button
                      key={run.run_id}
                      type="button"
                      onClick={() => void loadRunDetail(run.run_id)}
                      className={`group w-full border-2 p-3 text-left transition-all ${
                        active
                          ? 'border-[#1C2833] bg-[#F0F8FF] shadow-[2px_2px_0_0_#1C2833]'
                          : 'border-transparent bg-white hover:border-[#1C2833]'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[#1C2833]">
                        <MessageSquare size={16} className="shrink-0 text-[#66CCFF]" />
                        <span className="truncate text-md font-bold uppercase">{run.intent}</span>
                      </div>
                      <p className="line-clamp-2 pl-6 text-[12px] font-bold text-gray-400 uppercase leading-tight">{run.result_summary}</p>
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
            {!selectedRun && !loading ? (
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

            {selectedRun ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-white p-4 text-xl font-bold leading-tight text-[#1C2833] border-2 border-[#1C2833] shadow-[4px_4px_0_0_#1C2833] uppercase">
                  {selectedRun.request_run.user_request}
                </div>
              </div>
            ) : null}

            {runLoading ? (
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

            {toolSteps.length ? (
              <div className="flex w-full justify-start">
                <div className="flex w-full flex-col py-1 pl-14">
                  {toolSteps.map((step) => (
                    <ToolStepItem key={step.id} step={step} />
                  ))}
                </div>
              </div>
            ) : null}

            {selectedRun ? (
              <div className="flex justify-start">
                <div className="flex max-w-[85%] gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center bg-[#66CCFF] text-[#1C2833] border-2 border-[#1C2833]">
                    <Sparkles size={20} />
                  </div>
                  <div className="flex w-full flex-col gap-4">
                    <div className="w-fit bg-[#66CCFF] p-4 text-xl font-bold leading-tight text-[#1C2833] border-2 border-[#1C2833] shadow-[4px_4px_0_0_#1C2833] uppercase">
                      {selectedRunSummary}
                    </div>
                    <PreviewCard
                      title={previewTitle}
                      content={previewBody || selectedRunSummary}
                      onAccept={() => queuePrompt('Finalize this as a wiki page.')}
                      onReject={() => queuePrompt('Retry with different evidence.')}
                      onReply={() => queuePrompt('Continue to next step.')}
                    />
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

              <div className="flex items-center justify-between px-3 pb-3 pt-1 border-t-2 border-[#1C2833]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
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
                    disabled={!input.trim() || submitting}
                    className={`pixel-button text-xl px-6 py-2 ${
                      input.trim() && !submitting
                        ? 'bg-[#66CCFF]'
                        : 'opacity-50 grayscale cursor-not-allowed'
                    }`}
                  >
                    EXECUTE <Send size={20} className="ml-2 inline" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
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
  onAccept,
  onReject,
  onReply
}: {
  title: string;
  content: string;
  onAccept: () => void;
  onReject: () => void;
  onReply: () => void;
}) {
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

      <div className="grid grid-cols-2 gap-2 border-t-2 border-[#1C2833] p-4 bg-gray-50">
        <button type="button" onClick={onAccept} className="pixel-button bg-[#66CCFF] text-lg uppercase">
          [1] ACCEPT
        </button>
        <button type="button" onClick={onReject} className="pixel-button bg-[#FFB7C5] text-lg uppercase">
          [2] REJECT
        </button>
        <button type="button" onClick={onReply} className="col-span-2 pixel-button bg-white text-lg uppercase">
          [3] SEND FEEDBACK TO LIIY
        </button>
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
