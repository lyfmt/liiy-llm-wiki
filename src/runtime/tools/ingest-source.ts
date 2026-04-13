import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { runIngestFlow } from '../../flows/ingest/run-ingest-flow.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  sourceId: Type.String({ description: 'Accepted source manifest id to ingest' }),
  userRequest: Type.Optional(Type.String({ description: 'Optional user-facing description for the ingest run' }))
});

export type IngestSourceParameters = Static<typeof parameters>;

export function createIngestSourceTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'ingest_source',
    label: 'Ingest Source',
    description: 'Ingest an accepted source manifest into the wiki',
    parameters,
    execute: async (_toolCallId, params) => {
      const result = await runIngestFlow(runtimeContext.root, {
        runId: runtimeContext.allocateToolRunId('ingest'),
        userRequest: params.userRequest ?? `ingest ${params.sourceId}`,
        sourceId: params.sourceId
      });
      const outcome: RuntimeToolOutcome = {
        toolName: 'ingest_source',
        summary: result.review.needs_review ? 'ingest requires review' : 'ingest completed',
        evidence: result.changeSet.source_refs,
        touchedFiles: result.persisted,
        changeSet: result.changeSet,
        needsReview: result.review.needs_review,
        reviewReasons: result.review.reasons,
        resultMarkdown: result.review.needs_review
          ? `Queued for review: ${result.review.reasons.join('; ')}`
          : `Persisted: ${result.persisted.join(', ') || '_none_'}`
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}
