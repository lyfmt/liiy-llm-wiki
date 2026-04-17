import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { runQueryFlow, type QueryAnswerSynthesizer } from '../../flows/query/run-query-flow.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  question: Type.String({ description: 'Question whose durable query page should be drafted' }),
  rationale: Type.Optional(Type.String({ description: 'Why this durable query page should be drafted' }))
});

export type DraftQueryPageParameters = Static<typeof parameters>;

export interface DraftQueryPageToolOptions {
  synthesizeAnswer?: QueryAnswerSynthesizer;
}

export function createDraftQueryPageTool(
  runtimeContext: RuntimeContext,
  options: DraftQueryPageToolOptions = {}
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'draft_query_page',
    label: 'Draft Query Page',
    description:
      'Prepare a durable query-page draft for answers with clear long-term reuse. Do not use this for one-off replies, tentative answers, or low-value chat output. Preferred precursor to apply_draft_upsert for durable query writeback.',
    parameters,
    execute: async (_toolCallId, params) => {
      const result = await runQueryFlow(runtimeContext.root, {
        question: params.question,
        persistQueryPage: false,
        synthesizeAnswer: options.synthesizeAnswer
      });
      const slug = slugifyQuestion(params.question);
      const title = titleizeQuestion(params.question);
      const targetPath = `wiki/queries/${slug}.md`;
      const sourceRefs = result.rawSources;
      const outgoingLinks = result.sources;
      const body = [
        `# ${title}`,
        '',
        '## Answer',
        result.answer,
        '',
        '## Wiki Evidence',
        result.sources.length === 0 ? '- _none_' : result.sources.map((path) => `- ${path}`).join('\n'),
        '',
        '## Raw Evidence',
        result.rawEvidence.length === 0
          ? '- _none_'
          : result.rawEvidence.map((item) => `- ${item.path}: ${item.excerpt}`).join('\n')
      ].join('\n');
      const upsertArguments = {
        kind: 'query',
        slug,
        title,
        summary: `Durable answer for: ${params.question}`,
        status: 'active',
        updated_at: new Date().toISOString(),
        body,
        rationale: params.rationale?.trim() || 'capture a durable query answer',
        source_refs: sourceRefs,
        outgoing_links: outgoingLinks,
        aliases: [],
        tags: deriveTags(result.sources)
      };
      const resultMarkdown = [
        '# Query Page Draft',
        '',
        `- Target: ${targetPath}`,
        `- Question: ${params.question}`,
        `- Rationale: ${params.rationale?.trim() || 'capture a durable query answer'}`,
        `- Source refs: ${sourceRefs.join(', ') || '_none_'}`,
        `- Outgoing links: ${outgoingLinks.join(', ') || '_none_'}`,
        '- Preferred next step: apply_draft_upsert',
        '',
        '## Proposed Body',
        body,
        '',
        '## Upsert Arguments',
        JSON.stringify(upsertArguments, null, 2)
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'draft_query_page',
        summary: `drafted ${targetPath}`,
        evidence: [targetPath, ...result.sources, ...result.rawSources],
        touchedFiles: [],
        resultMarkdown,
        data: {
          draft: {
            targetPath,
            upsertArguments
          }
        }
      };

      return {
        content: [{ type: 'text', text: resultMarkdown }],
        details: outcome
      };
    }
  };
}

function slugifyQuestion(question: string): string {
  return question.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
}

function titleizeQuestion(question: string): string {
  return question
    .trim()
    .replace(/\?+$/, '')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function deriveTags(paths: string[]): string[] {
  return [...new Set(paths.flatMap((path) => path.split('/').at(-1)?.replace(/\.md$/, '').split('-') ?? []).filter(Boolean))];
}
