import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { RuntimeContext } from '../runtime-context.js';

const parameters = Type.Object({
  attachmentId: Type.Optional(Type.String({ description: 'Chat attachment id to submit to the V3 pipeline' })),
  sourceId: Type.Optional(Type.String({ description: 'Existing source manifest id to submit to the V3 pipeline' }))
});

export type StartKnowledgeInsertPipelineParameters = Static<typeof parameters>;

export interface StartKnowledgeInsertPipelineResult {
  runId: string;
  sourceId: string;
  status: string;
  artifactsRoot: string;
}

export interface CreateStartKnowledgeInsertPipelineToolOptions {
  startFromAttachment?: (input: { attachmentId: string; sessionId?: string; root: string }) => Promise<StartKnowledgeInsertPipelineResult>;
  startFromSource?: (input: { sourceId: string; sessionId?: string; root: string }) => Promise<StartKnowledgeInsertPipelineResult>;
}

export function createStartKnowledgeInsertPipelineTool(
  runtimeContext: RuntimeContext,
  options: CreateStartKnowledgeInsertPipelineToolOptions = {}
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'start_knowledge_insert_pipeline',
    label: 'Start Knowledge Insert Pipeline',
    description:
      'Start the system-governed Knowledge Insert Pipeline V3 for a chat attachment or existing source. This tool only launches the pipeline and returns run status; it must not inspect artifacts, write wiki pages, or decide extracted knowledge.',
    parameters,
    execute: async (_toolCallId, params) => {
      if ((params.attachmentId && params.sourceId) || (!params.attachmentId && !params.sourceId)) {
        throw new Error('Provide exactly one of attachmentId or sourceId');
      }

      const result = params.attachmentId
        ? await requireLauncher(options.startFromAttachment, 'attachment')({
            attachmentId: params.attachmentId,
            ...(runtimeContext.sessionId ? { sessionId: runtimeContext.sessionId } : {}),
            root: runtimeContext.root
          })
        : await requireLauncher(options.startFromSource, 'source')({
            sourceId: params.sourceId!,
            ...(runtimeContext.sessionId ? { sessionId: runtimeContext.sessionId } : {}),
            root: runtimeContext.root
          });

      const resultMarkdown = [
        `Knowledge insert pipeline started: ${result.runId}`,
        `Source: ${result.sourceId}`,
        `Status: ${result.status}`,
        `Artifacts: ${result.artifactsRoot}`
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'start_knowledge_insert_pipeline',
        summary: `started knowledge insert pipeline ${result.runId} for ${result.sourceId}`,
        evidence: [result.artifactsRoot],
        touchedFiles: [],
        resultMarkdown,
        data: {
          runId: result.runId,
          sourceId: result.sourceId,
          status: result.status,
          artifactsRoot: result.artifactsRoot
        }
      };

      return {
        content: [{ type: 'text', text: resultMarkdown }],
        details: outcome
      };
    }
  };
}

function requireLauncher<T>(launcher: T | undefined, kind: string): T {
  if (!launcher) {
    throw new Error(`No knowledge insert pipeline ${kind} launcher configured`);
  }
  return launcher;
}
