import { describe, expect, it } from 'vitest';

import {
  buildIntentPlan,
  classifyIntent,
  createRuntimeContext,
  createRuntimeRunState,
  createIngestSourceTool,
  createLintWikiTool,
  createQueryWikiTool,
  runRuntimeAgent
} from '../../src/index.js';
import type {
  CreateRuntimeContextInput,
  CreateRuntimeRunStateInput,
  IngestSourceParameters,
  LintWikiParameters,
  QueryWikiParameters,
  RunRuntimeAgentInput,
  RuntimeIntent,
  RuntimeToolOutcome
} from '../../src/index.js';

describe('package entry runtime exports', () => {
  it('re-exports the runtime APIs and public types', () => {
    expect(typeof classifyIntent).toBe('function');
    expect(typeof buildIntentPlan).toBe('function');
    expect(typeof createRuntimeContext).toBe('function');
    expect(typeof createRuntimeRunState).toBe('function');
    expect(typeof createIngestSourceTool).toBe('function');
    expect(typeof createQueryWikiTool).toBe('function');
    expect(typeof createLintWikiTool).toBe('function');
    expect(typeof runRuntimeAgent).toBe('function');

    const intent: RuntimeIntent = 'query';
    const contextInput: CreateRuntimeContextInput | null = null;
    const stateInput: CreateRuntimeRunStateInput | null = null;
    const toolOutcome: RuntimeToolOutcome | null = null;
    const agentInput: RunRuntimeAgentInput | null = null;
    const ingestParams: IngestSourceParameters | null = null;
    const queryParams: QueryWikiParameters | null = null;
    const lintParams: LintWikiParameters | null = null;

    expect(intent).toBe('query');
    expect(contextInput).toBeNull();
    expect(stateInput).toBeNull();
    expect(toolOutcome).toBeNull();
    expect(agentInput).toBeNull();
    expect(ingestParams).toBeNull();
    expect(queryParams).toBeNull();
    expect(lintParams).toBeNull();
  });
});
