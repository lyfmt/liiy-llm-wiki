import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RunRuntimeAgentInput, RunRuntimeAgentResult } from '../../runtime/agent-session.js';

export interface ApiRouteDependencies {
  runRuntimeAgent: (input: {
    root: string;
    userRequest: string;
    runId: string;
    model?: RunRuntimeAgentInput['model'];
    getApiKey?: RunRuntimeAgentInput['getApiKey'];
    allowQueryWriteback?: boolean;
    allowLintAutoFix?: boolean;
  }) => Promise<RunRuntimeAgentResult>;
}

export interface ApiRouteContext {
  root: string;
  request: IncomingMessage;
  response: ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  dependencies: ApiRouteDependencies;
  assertTaskStatus: (value: unknown) => 'pending' | 'in_progress' | 'needs_review' | 'done';
}
