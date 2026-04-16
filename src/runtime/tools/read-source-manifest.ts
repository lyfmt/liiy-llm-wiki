import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { loadSourceManifest } from '../../storage/source-manifest-store.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  sourceId: Type.String({ description: 'Source manifest id' })
});

export type ReadSourceManifestParameters = Static<typeof parameters>;

export function createReadSourceManifestTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'read_source_manifest',
    label: 'Read Source Manifest',
    description: 'Read a source manifest with metadata and ingest status',
    parameters,
    execute: async (_toolCallId, params) => {
      const manifest = await loadSourceManifest(runtimeContext.root, params.sourceId);
      const resultMarkdown = [
        `ID: ${manifest.id}`,
        `Title: ${manifest.title}`,
        `Path: ${manifest.path}`,
        `Type: ${manifest.type}`,
        `Status: ${manifest.status}`,
        `Hash: ${manifest.hash}`,
        `Imported at: ${manifest.imported_at}`,
        `Tags: ${manifest.tags.join(', ') || '_none_'}`,
        '',
        'Notes:',
        manifest.notes || '_none_'
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'read_source_manifest',
        summary: `read source manifest ${manifest.id}`,
        evidence: [manifest.path],
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
