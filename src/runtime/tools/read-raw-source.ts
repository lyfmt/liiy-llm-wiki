import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { readRawDocument } from '../../flows/ingest/read-raw-document.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  rawPath: Type.String({ description: 'Accepted raw source path under raw/accepted/' })
});

export type ReadRawSourceParameters = Static<typeof parameters>;

export function createReadRawSourceTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'read_raw_source',
    label: 'Read Raw Source',
    description:
      'Read an accepted raw source document when a wiki page or source reference points to it and the raw evidence matters. Not for casual chat or speculative browsing without a concrete evidence need.',
    parameters,
    execute: async (_toolCallId, params) => {
      const body = await readRawDocument(runtimeContext.root, params.rawPath);
      const resultMarkdown = [`Path: ${params.rawPath}`, '', 'Body:', body.trim() || '_empty_'].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'read_raw_source',
        summary: `read ${params.rawPath}`,
        evidence: [params.rawPath],
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
