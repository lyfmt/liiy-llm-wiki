import { complete, Type, type Api, type Context, type Model, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import {
  runQueryFlow,
  type QueryAnswerSynthesizer,
  type QueryAnswerSynthesisInput,
  type QueryWikiEvidence
} from '../../flows/query/run-query-flow.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  question: Type.String({ description: 'Question to answer from the wiki' }),
  persistQueryPage: Type.Optional(Type.Boolean({ description: 'Whether to save the answer as a query page' }))
});

export type QueryWikiParameters = Static<typeof parameters>;

export interface QueryWikiToolOptions {
  synthesizeAnswer?: QueryAnswerSynthesizer;
}

export interface ModelBackedQueryAnswerSynthesizerInput {
  model: Model<Api>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  sessionId?: string;
}

export function createQueryWikiTool(
  runtimeContext: RuntimeContext,
  options: QueryWikiToolOptions = {}
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'query_wiki',
    label: 'Query Wiki',
    description:
      'Synthesize an answer from wiki pages and raw evidence when direct navigation and reading are not enough. Do not use this for greetings, test messages, casual chat, or questions you can answer reliably without wiki evidence.',
    parameters,
    execute: async (_toolCallId, params) => {
      const persistQueryPage = runtimeContext.allowQueryWriteback && (params.persistQueryPage ?? false);
      const result = await runQueryFlow(runtimeContext.root, {
        question: params.question,
        persistQueryPage,
        synthesizeAnswer: options.synthesizeAnswer
      });
      const touchedFiles = result.persistedQueryPage ? [result.persistedQueryPage] : [];
      const evidence = [...result.sources, ...result.rawSources];
      const outcome: RuntimeToolOutcome = {
        toolName: 'query_wiki',
        summary: result.answer,
        evidence,
        touchedFiles,
        changeSet: result.changeSet,
        needsReview: result.review.needs_review,
        reviewReasons: result.review.reasons,
        resultMarkdown: [
          'Answer:',
          result.answer,
          '',
          `Synthesis mode: ${result.synthesisMode}`,
          `Synthesis fallback: ${result.synthesisFallbackReason ?? '_none_'}`,
          `Navigation path: ${result.sources.join(' -> ') || '_none_'}`,
          `Raw sources: ${result.rawSources.join(', ') || '_none_'}`,
          `Wiki evidence: ${result.wikiEvidence.map((item) => `${item.path} [${item.matchReasons.join(', ') || 'matched'}]`).join(' | ') || '_none_'}`,
          `Raw evidence excerpts: ${result.rawEvidence.map((item) => `${item.path} => ${item.excerpt}`).join(' | ') || '_none_'}`,
          `Persisted query page: ${result.persistedQueryPage ?? '_none_'}`
        ].join('\n'),
        data: {
          synthesisMode: result.synthesisMode,
          synthesisFallbackReason: result.synthesisFallbackReason,
          wikiEvidence: result.wikiEvidence.map((item) => ({
            path: item.path,
            kind: item.kind,
            sourceRefs: item.sourceRefs,
            matchReasons: item.matchReasons
          }))
        }
      };

      return {
        content: [{ type: 'text', text: result.answer }],
        details: outcome
      };
    }
  };
}

export function createModelBackedQueryAnswerSynthesizer(
  input: ModelBackedQueryAnswerSynthesizerInput
): QueryAnswerSynthesizer {
  return async (synthesisInput) => {
    const apiKey = await input.getApiKey?.(input.model.provider);
    const response = await complete(input.model, buildQuerySynthesisContext(synthesisInput), {
      ...(apiKey ? { apiKey } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {})
    });

    if (response.stopReason === 'error' || response.stopReason === 'aborted') {
      throw new Error(response.errorMessage ?? `Query synthesis failed with ${response.stopReason}`);
    }

    if (response.content.some((block) => block.type === 'toolCall')) {
      throw new Error('Query synthesizer returned tool calls instead of a grounded answer');
    }

    const answer = response.content
      .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (answer.length === 0) {
      throw new Error('Query synthesizer returned an empty answer');
    }

    return {
      answer,
      mode: 'llm'
    };
  };
}

function buildQuerySynthesisContext(input: QueryAnswerSynthesisInput): Context {
  return {
    systemPrompt: [
      'You are the grounded query synthesizer for a local-first wiki knowledge system.',
      'Answer only from the supplied wiki and raw evidence.',
      'Do not invent facts, tools, files, or conclusions that are not supported by the evidence packet.',
      'If the evidence is partial, weak, or conflicting, say so explicitly.',
      'Mention the supporting wiki page paths directly in the answer.',
      'If raw evidence exists, mention the raw source paths briefly.',
      'Keep the answer concise and useful for a durable wiki query page.'
    ].join(' '),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `Question: ${input.question}`,
              '',
              'Wiki evidence:',
              renderWikiEvidenceForPrompt(input.wikiEvidence),
              '',
              'Raw evidence:',
              renderRawEvidenceForPrompt(input.rawEvidence),
              '',
              'Required answer format:',
              '- Provide a short grounded answer in prose.',
              '- Cite the supporting wiki page paths inline.',
              '- Mention raw source paths when they materially support the answer.',
              '- If evidence is insufficient or conflicting, say that plainly.'
            ].join('\n')
          }
        ],
        timestamp: Date.now()
      }
    ]
  };
}

function renderWikiEvidenceForPrompt(wikiEvidence: QueryWikiEvidence[]): string {
  if (wikiEvidence.length === 0) {
    return '- _none_';
  }

  return wikiEvidence
    .map((item, index) =>
      [
        `${index + 1}. ${item.title} (${item.path})`,
        `   kind: ${item.kind}`,
        `   summary: ${item.summary || '_none_'}`,
        `   body excerpt: ${item.bodyExcerpt || '_none_'}`,
        `   source refs: ${item.sourceRefs.join(', ') || '_none_'}`,
        `   outgoing links: ${item.outgoingLinks.join(', ') || '_none_'}`,
        `   match reasons: ${item.matchReasons.join(', ') || '_none_'}`
      ].join('\n')
    )
    .join('\n\n');
}

function renderRawEvidenceForPrompt(rawEvidence: QueryAnswerSynthesisInput['rawEvidence']): string {
  if (rawEvidence.length === 0) {
    return '- _none_';
  }

  return rawEvidence.map((item) => `- ${item.path}: ${item.excerpt}`).join('\n');
}
