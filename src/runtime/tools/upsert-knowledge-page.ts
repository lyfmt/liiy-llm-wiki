import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { runUpsertKnowledgePageFlow } from '../../flows/wiki/run-upsert-knowledge-page-flow.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const pageKind = Type.Union([
  Type.Literal('source'),
  Type.Literal('entity'),
  Type.Literal('topic'),
  Type.Literal('query')
]);

const parameters = Type.Object({
  kind: pageKind,
  slug: Type.String({ description: 'Target page slug without .md' }),
  title: Type.String({ description: 'Page title' }),
  aliases: Type.Optional(Type.Array(Type.String())),
  summary: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  source_refs: Type.Array(Type.String({ description: 'Supporting source references' })),
  outgoing_links: Type.Optional(Type.Array(Type.String())),
  status: Type.String({ description: 'Page status' }),
  updated_at: Type.String({ description: 'Last updated timestamp' }),
  body: Type.String({ description: 'Markdown body content' }),
  rationale: Type.String({ description: 'Why this page should be created or updated' }),
  userRequest: Type.Optional(Type.String({ description: 'Optional user-facing request summary' }))
});

export type UpsertKnowledgePageParameters = Static<typeof parameters>;

export function createUpsertKnowledgePageTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'upsert_knowledge_page',
    label: 'Upsert Knowledge Page',
    description:
      'Create or update a wiki page through a governed deterministic flow. Use only for explicit wiki maintenance or when a durable write is clearly justified. Prefer draft-first flows when possible.',
    parameters,
    execute: async (_toolCallId, params) => {
      const result = await runUpsertKnowledgePageFlow(runtimeContext.root, {
        runId: runtimeContext.allocateToolRunId('upsert-page'),
        userRequest: params.userRequest ?? `upsert ${params.kind} ${params.slug}`,
        kind: params.kind,
        slug: params.slug,
        title: params.title,
        aliases: params.aliases,
        summary: params.summary,
        tags: params.tags,
        source_refs: params.source_refs,
        outgoing_links: params.outgoing_links,
        status: params.status,
        updated_at: params.updated_at,
        body: params.body,
        rationale: params.rationale
      });
      const outcome: RuntimeToolOutcome = {
        toolName: 'upsert_knowledge_page',
        summary: result.review.needs_review ? 'page upsert requires review' : 'page upsert completed',
        evidence: [result.page.path, ...result.page.source_refs],
        touchedFiles: result.persisted,
        changeSet: result.changeSet,
        needsReview: result.review.needs_review,
        reviewReasons: result.review.reasons,
        resultMarkdown: [
          `Target page: ${result.page.path}`,
          `Source refs: ${result.page.source_refs.join(', ') || '_none_'}`,
          result.review.needs_review
            ? `Queued for review: ${result.review.reasons.join('; ')}`
            : `Persisted: ${result.persisted.join(', ') || '_none_'}`
        ].join('\n')
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}
