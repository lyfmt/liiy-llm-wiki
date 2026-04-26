import { runRuntimeAgent, type RunRuntimeAgentResult } from '../runtime/agent-session.js';
import { startKnowledgeInsertPipelineFromAttachment } from '../flows/knowledge-insert/start-knowledge-insert-pipeline-from-attachment.js';

export interface WebServerDependencies {
  runRuntimeAgent: (input: {
    root: string;
    userRequest: string;
    runId: string;
    sessionId?: Parameters<typeof runRuntimeAgent>[0]['sessionId'];
    conversationHistory?: Parameters<typeof runRuntimeAgent>[0]['conversationHistory'];
    currentUserMessage?: Parameters<typeof runRuntimeAgent>[0]['currentUserMessage'];
    attachments?: Parameters<typeof runRuntimeAgent>[0]['attachments'];
    model?: RunRuntimeAgentResult extends never ? never : Parameters<typeof runRuntimeAgent>[0]['model'];
    getApiKey?: Parameters<typeof runRuntimeAgent>[0]['getApiKey'];
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

export const defaultWebServerDependencies: WebServerDependencies = {
  runRuntimeAgent,
  runKnowledgeInsertPipelineFromAttachment: startKnowledgeInsertPipelineFromAttachment
};
