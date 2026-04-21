import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { runSourceGroundedIngestFlow } from '../../flows/ingest/run-source-grounded-ingest-flow.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  sourceId: Type.Optional(Type.String({ description: 'Accepted source manifest id to ingest into the graph' })),
  sourcePath: Type.Optional(Type.String({ description: 'Accepted raw source path to ingest into the graph' })),
  userRequest: Type.Optional(Type.String({ description: 'Optional user-facing description for the ingest run' }))
});

export type IngestSourceToGraphParameters = Static<typeof parameters>;

export function createIngestSourceToGraphTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'ingest_source_to_graph',
    label: 'Ingest Source To Graph',
    description:
      'Convert one accepted source into a source-grounded topic overview plus grounded sections in the graph, while keeping the source-page compatibility layer refreshed.',
    parameters,
    execute: async (_toolCallId, params) => {
      const result = await runSourceGroundedIngestFlow(runtimeContext.root, {
        runId: runtimeContext.allocateToolRunId('ingest-source-to-graph'),
        userRequest:
          params.userRequest
          ?? `ingest source to graph ${params.sourceId ?? params.sourcePath ?? 'unknown-source'}`,
        ...(params.sourceId === undefined ? {} : { sourceId: params.sourceId }),
        ...(params.sourcePath === undefined ? {} : { sourcePath: params.sourcePath })
      });
      const summary = result.review.needs_review
        ? `source-grounded ingest queued for review for ${result.topic.id}`
        : `generated topic ${result.topic.id} with ${result.sections.length} sections`;
      const resultMarkdownLines = [
        '# Source-grounded Ingest Tool Result',
        '',
        result.review.needs_review
          ? `Queued for review: ${result.review.reasons.join('; ')}`
          : `Generated topic: ${result.topic.id}`,
        `Graph target: ${result.graphTarget}`,
        `Sections: ${result.sections.length}`,
        `Source: ${result.sourcePath}`,
        `Coverage status: ${result.coverage.coverage_status}`,
        `Covered anchors: ${result.coverage.covered_anchor_count}/${result.coverage.total_anchor_count}`
      ];

      if (result.coverage.uncovered_anchor_ids.length > 0) {
        resultMarkdownLines.push(`Uncovered anchors: ${result.coverage.uncovered_anchor_ids.join(', ')}`);
      }

      if (result.review.needs_review) {
        resultMarkdownLines.push(`Graph conflict: ${result.review.reasons.join('; ')}`);
      }

      resultMarkdownLines.push('');
      const resultMarkdown = resultMarkdownLines.join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'ingest_source_to_graph',
        summary,
        evidence: [result.sourcePath],
        touchedFiles: result.persisted,
        changeSet: result.changeSet,
        needsReview: result.review.needs_review,
        reviewReasons: result.review.reasons,
        resultMarkdown,
        data: {
          topicId: result.topic.id,
          graphTarget: result.graphTarget,
          sectionCount: result.sections.length,
          sourceCoverage: result.coverage
        }
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}
