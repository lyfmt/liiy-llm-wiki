import { runRuntimeAgent, type RunRuntimeAgentResult } from '../runtime/agent-session.js';

export interface WebServerDependencies {
  runRuntimeAgent: (input: {
    root: string;
    userRequest: string;
    runId: string;
    model?: RunRuntimeAgentResult extends never ? never : Parameters<typeof runRuntimeAgent>[0]['model'];
    getApiKey?: Parameters<typeof runRuntimeAgent>[0]['getApiKey'];
    allowQueryWriteback?: boolean;
    allowLintAutoFix?: boolean;
  }) => Promise<RunRuntimeAgentResult>;
}

export const defaultWebServerDependencies: WebServerDependencies = {
  runRuntimeAgent
};
