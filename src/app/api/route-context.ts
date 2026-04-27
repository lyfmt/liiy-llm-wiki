import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RunRuntimeAgentInput, RunRuntimeAgentResult } from '../../runtime/agent-session.js';

export interface ApiRouteDependencies {
  runRuntimeAgent: (input: {
    root: string;
    userRequest: string;
    runId: string;
    sessionId?: string;
    conversationHistory?: RunRuntimeAgentInput['conversationHistory'];
    currentUserMessage?: RunRuntimeAgentInput['currentUserMessage'];
    attachments?: RunRuntimeAgentInput['attachments'];
    model?: RunRuntimeAgentInput['model'];
    getApiKey?: RunRuntimeAgentInput['getApiKey'];
    allowQueryWriteback?: boolean;
    allowLintAutoFix?: boolean;
  }) => Promise<RunRuntimeAgentResult>;
  runKnowledgeInsertPipelineFromAttachment?: (input: {
    root: string;
    attachmentId: string;
    sessionId: string;
    runId?: string;
    maxPartExtractionConcurrency?: number;
    resetKnowledgeGraphBeforeRun?: boolean;
  }) => Promise<{ runId: string; sourceId?: string; status: string }>;
}

export interface ApiRouteContext {
  root: string;
  request: IncomingMessage;
  response: ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  dependencies: ApiRouteDependencies;
  assertTaskStatus: (value: unknown) => 'pending' | 'in_progress' | 'needs_review' | 'done';
}
