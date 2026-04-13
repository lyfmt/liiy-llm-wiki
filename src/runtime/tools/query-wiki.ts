import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { runQueryFlow } from '../../flows/query/run-query-flow.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  question: Type.String({ description: 'Question to answer from the wiki' }),
  persistQueryPage: Type.Optional(Type.Boolean({ description: 'Whether to save the answer as a query page' }))
});

export type QueryWikiParameters = Static<typeof parameters>;

export function createQueryWikiTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'query_wiki',
    label: 'Query Wiki',
    description: 'Query the wiki and optionally persist a reusable query page',
    parameters,
    execute: async (_toolCallId, params) => {
      const persistQueryPage = runtimeContext.allowQueryWriteback && (params.persistQueryPage ?? false);
      const result = await runQueryFlow(runtimeContext.root, {
        question: params.question,
        persistQueryPage
      });
      const touchedFiles = result.persistedQueryPage ? [result.persistedQueryPage] : [];
      const outcome: RuntimeToolOutcome = {
        toolName: 'query_wiki',
        summary: result.answer,
        evidence: result.sources,
        touchedFiles,
        resultMarkdown: `Answer: ${result.answer}\nSources: ${result.sources.join(', ') || '_none_'}`
      };

      return {
        content: [{ type: 'text', text: result.answer }],
        details: outcome
      };
    }
  };
}
