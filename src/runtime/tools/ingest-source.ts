import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { runIngestFlow } from '../../flows/ingest/run-ingest-flow.js';
import { findAcceptedSourceManifestByPath } from '../../storage/source-manifest-store.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  sourceId: Type.Optional(Type.String({ description: 'Accepted source manifest id to ingest' })),
  sourcePath: Type.Optional(Type.String({ description: 'Accepted raw source path to resolve and ingest' })),
  userRequest: Type.Optional(Type.String({ description: 'Optional user-facing description for the ingest run' }))
});

export type IngestSourceParameters = Static<typeof parameters>;

export function createIngestSourceTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'ingest_source',
    label: 'Ingest Source',
    description:
      'Ingest an accepted source manifest by manifest id or accepted raw path. Use only when the user explicitly asks for ingest or source expansion, and resolve ambiguity first.',
    parameters,
    execute: async (_toolCallId, params) => {
      const hasSourceId = typeof params.sourceId === 'string';
      const hasSourcePath = typeof params.sourcePath === 'string';

      if (hasSourceId === hasSourcePath) {
        throw new Error('Invalid ingest source locator: provide exactly one of sourceId or sourcePath');
      }

      const sourcePath = hasSourcePath ? params.sourcePath : undefined;
      const resolvedManifest = sourcePath
        ? await findAcceptedSourceManifestByPath(runtimeContext.root, sourcePath)
        : null;
      const sourceId = params.sourceId ?? resolvedManifest?.id;
      const sourceLabel = sourcePath ?? sourceId;

      if (!sourceId || !sourceLabel) {
        throw new Error('Invalid ingest source locator: unable to resolve sourceId or sourcePath');
      }

      const result = await runIngestFlow(runtimeContext.root, {
        runId: runtimeContext.allocateToolRunId('ingest'),
        userRequest: params.userRequest ?? `ingest ${sourceLabel}`,
        sourceId
      });
      const resolutionPrefix = resolvedManifest ? `Resolved ${params.sourcePath} to ${resolvedManifest.id}. ` : '';
      const outcome: RuntimeToolOutcome = {
        toolName: 'ingest_source',
        summary: result.review.needs_review ? 'ingest requires review' : 'ingest completed',
        evidence: result.changeSet.source_refs,
        touchedFiles: result.persisted,
        changeSet: result.changeSet,
        needsReview: result.review.needs_review,
        reviewReasons: result.review.reasons,
        resultMarkdown: result.review.needs_review
          ? `${resolutionPrefix}Queued for review: ${result.review.reasons.join('; ')}`
          : `${resolutionPrefix}Persisted: ${result.persisted.join(', ') || '_none_'}`
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}
