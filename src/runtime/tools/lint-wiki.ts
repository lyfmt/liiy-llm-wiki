import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { runLintFlow } from '../../flows/lint/run-lint-flow.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  userRequest: Type.Optional(Type.String({ description: 'Optional user-facing description for the lint run' })),
  autoFix: Type.Optional(Type.Boolean({ description: 'Whether lint may rebuild the wiki index' }))
});

export type LintWikiParameters = Static<typeof parameters>;

export function createLintWikiTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'lint_wiki',
    label: 'Lint Wiki',
    description: 'Run deterministic wiki lint checks and optional low-risk autofix',
    parameters,
    execute: async (_toolCallId, params) => {
      const result = await runLintFlow(runtimeContext.root, {
        runId: runtimeContext.allocateToolRunId('lint'),
        userRequest: params.userRequest ?? 'lint wiki',
        autoFix: runtimeContext.allowLintAutoFix && (params.autoFix ?? false)
      });
      const reviewReasons = result.reviewCandidates.map((candidate) => `${candidate.type}: ${candidate.evidence.join(', ')}`);
      const outcome: RuntimeToolOutcome = {
        toolName: 'lint_wiki',
        summary: `${result.findings.length} finding(s), ${result.reviewCandidates.length} review candidate(s)`,
        evidence: result.findings.flatMap((finding) => finding.evidence),
        touchedFiles: result.autoFixed,
        changeSet:
          result.autoFixed.length === 0
            ? null
            : {
                target_files: result.autoFixed,
                patch_summary: 'runtime lint auto-fix',
                rationale: 'rebuild wiki index during lint',
                source_refs: [],
                risk_level: 'low',
                needs_review: false
              },
        needsReview: result.reviewCandidates.length > 0,
        reviewReasons,
        resultMarkdown: `${result.findings.length} finding(s); auto-fixed: ${result.autoFixed.join(', ') || '_none_'}`
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}
