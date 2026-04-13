import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { bootstrapProject, type BootstrapProjectResult } from './app/bootstrap-project.js';
import { runRuntimeAgent, type RunRuntimeAgentResult } from './runtime/agent-session.js';

export interface CliDependencies {
  bootstrapProject: (root: string) => Promise<BootstrapProjectResult>;
  runRuntimeAgent: (input: { root: string; userRequest: string; runId: string }) => Promise<RunRuntimeAgentResult>;
}

const defaultCliDependencies: CliDependencies = {
  bootstrapProject,
  runRuntimeAgent
};

export function logDirectExecError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}

export async function main(argv = process.argv, dependencies: CliDependencies = defaultCliDependencies): Promise<void> {
  const command = argv[2];

  if (!command) {
    throw new Error('Usage: node dist/cli.js <project-root> | bootstrap <project-root> | run <project-root> <request>');
  }

  if (command === 'bootstrap') {
    const root = argv[3];

    if (!root) {
      throw new Error('Usage: node dist/cli.js bootstrap <project-root>');
    }

    await printBootstrapResult(root, dependencies.bootstrapProject);
    return;
  }

  if (command === 'run') {
    const root = argv[3];
    const userRequest = argv.slice(4).join(' ').trim();

    if (!root || userRequest.length === 0) {
      throw new Error('Usage: node dist/cli.js run <project-root> <request>');
    }

    const result = await dependencies.runRuntimeAgent({
      root,
      userRequest,
      runId: randomUUID()
    });

    console.log(
      JSON.stringify(
        {
          root,
          runId: result.runId,
          intent: result.intent,
          plan: result.plan,
          assistant: result.assistantText,
          toolOutcomes: result.toolOutcomes,
          savedRunState: result.savedRunState
        },
        null,
        2
      )
    );
    return;
  }

  await printBootstrapResult(command, dependencies.bootstrapProject);
}

async function printBootstrapResult(
  root: string,
  bootstrapProjectImpl: CliDependencies['bootstrapProject']
): Promise<void> {
  const result = await bootstrapProjectImpl(root);

  console.log(
    JSON.stringify(
      {
        root,
        directories: result.directories.length,
        files: result.files.length
      },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    logDirectExecError(error);
    process.exitCode = 1;
  });
}
