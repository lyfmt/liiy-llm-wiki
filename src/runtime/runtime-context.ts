export interface RuntimeContext {
  root: string;
  runId: string;
  allowQueryWriteback: boolean;
  allowLintAutoFix: boolean;
  allocateToolRunId: (toolName: string) => string;
}

export interface CreateRuntimeContextInput {
  root: string;
  runId: string;
  allowQueryWriteback?: boolean;
  allowLintAutoFix?: boolean;
}

export function createRuntimeContext(input: CreateRuntimeContextInput): RuntimeContext {
  const counters = new Map<string, number>();

  return {
    root: input.root,
    runId: input.runId,
    allowQueryWriteback: input.allowQueryWriteback ?? false,
    allowLintAutoFix: input.allowLintAutoFix ?? false,
    allocateToolRunId: (toolName: string) => {
      const nextCount = (counters.get(toolName) ?? 0) + 1;
      counters.set(toolName, nextCount);
      return `${input.runId}--${toolName}-${nextCount}`;
    }
  };
}
