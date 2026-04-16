import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { createUpsertKnowledgePageTool, type UpsertKnowledgePageParameters } from './upsert-knowledge-page.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const pageKind = Type.Union([
  Type.Literal('source'),
  Type.Literal('entity'),
  Type.Literal('topic'),
  Type.Literal('query')
]);

const upsertArgumentsSchema = Type.Object({
  kind: pageKind,
  slug: Type.String(),
  title: Type.String(),
  aliases: Type.Optional(Type.Array(Type.String())),
  summary: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  source_refs: Type.Array(Type.String()),
  outgoing_links: Type.Optional(Type.Array(Type.String())),
  status: Type.String(),
  updated_at: Type.String(),
  body: Type.String(),
  rationale: Type.String(),
  userRequest: Type.Optional(Type.String())
});

const parameters = Type.Object({
  targetPath: Type.String({ description: 'Draft target path for traceability' }),
  upsertArguments: upsertArgumentsSchema
});

export type ApplyDraftUpsertParameters = Static<typeof parameters>;

export function createApplyDraftUpsertTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  const upsertTool = createUpsertKnowledgePageTool(runtimeContext);

  return {
    name: 'apply_draft_upsert',
    label: 'Apply Draft Upsert',
    description: 'Apply a machine-readable draft payload through governed page upsert; preferred follow-up after draft_query_page or draft_knowledge_page',
    parameters,
    execute: async (toolCallId, params) => {
      const result = await upsertTool.execute(toolCallId, params.upsertArguments as UpsertKnowledgePageParameters);
      const details = result.details as RuntimeToolOutcome;

      const existingData = details.data && typeof details.data === 'object' && !Array.isArray(details.data) ? details.data : {};

      return {
        content: result.content,
        details: {
          ...details,
          toolName: 'apply_draft_upsert',
          summary: details.summary,
          resultMarkdown: [`Draft target: ${params.targetPath}`, details.resultMarkdown ?? details.summary].join('\n'),
          data: {
            ...existingData,
            draft: {
              targetPath: params.targetPath,
              upsertArguments: params.upsertArguments
            }
          }
        }
      };
    }
  };
}
