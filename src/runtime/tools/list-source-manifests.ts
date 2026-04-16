import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { listSourceManifests } from '../../storage/source-manifest-store.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal('inbox'),
      Type.Literal('accepted'),
      Type.Literal('rejected'),
      Type.Literal('processed')
    ])
  )
});

export type ListSourceManifestsParameters = Static<typeof parameters>;

export function createListSourceManifestsTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'list_source_manifests',
    label: 'List Source Manifests',
    description: 'List source manifests and their ingest status',
    parameters,
    execute: async (_toolCallId, params) => {
      const manifests = (await listSourceManifests(runtimeContext.root)).filter((manifest) => {
        return params.status === undefined ? true : manifest.status === params.status;
      });
      const resultMarkdown =
        manifests.length === 0
          ? 'No source manifests found.'
          : manifests
              .map((manifest) => {
                return `- ${manifest.id} | ${manifest.status} | ${manifest.title} | ${manifest.path} | tags: ${manifest.tags.join(', ') || '_none_'}`;
              })
              .join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'list_source_manifests',
        summary: `listed ${manifests.length} source manifest(s)`,
        evidence: manifests.map((manifest) => manifest.path),
        touchedFiles: [],
        resultMarkdown
      };

      return {
        content: [{ type: 'text', text: resultMarkdown }],
        details: outcome
      };
    }
  };
}
