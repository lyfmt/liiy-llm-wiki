import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { findAcceptedSourceManifestCandidates } from '../../storage/source-manifest-store.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  query: Type.String({ description: 'Natural-language description of the source manifest to find' })
});

export type FindSourceManifestParameters = Static<typeof parameters>;

export function createFindSourceManifestTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'find_source_manifest',
    label: 'Find Source Manifest',
    description:
      'Find accepted source manifest candidates for a natural-language ingest reference. Use this before ingest when the source reference is loose or ambiguous.',
    parameters,
    execute: async (_toolCallId, params) => {
      const candidates = await findAcceptedSourceManifestCandidates(runtimeContext.root, params.query);
      const topScore = candidates[0]?.score ?? 0;
      const topCandidates = candidates.filter((candidate) => candidate.score === topScore && topScore > 0);
      const selectedCandidate = topCandidates.length === 1 ? topCandidates[0] : null;
      const summary =
        candidates.length === 0
          ? 'no accepted source manifests matched'
          : selectedCandidate
            ? `selected ${selectedCandidate.manifest.id}`
            : `found ${candidates.length} accepted source manifest candidates`;
      const lines =
        candidates.length === 0
          ? ['No accepted source manifests matched.']
          : candidates.map((candidate) => {
              return `- ${candidate.manifest.id}: ${candidate.manifest.title} (${candidate.manifest.path}) [${candidate.reasons.join(', ')}]`;
            });
      const resultMarkdown = [
        selectedCandidate
          ? `Selected candidate: ${selectedCandidate.manifest.id}`
          : candidates.length === 0
            ? 'No candidates'
            : 'Ambiguous candidates',
        ...lines
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'find_source_manifest',
        summary,
        evidence: candidates.map((candidate) => candidate.manifest.path),
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
