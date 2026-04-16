import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';

import { bootstrapProject, type BootstrapProjectResult } from './app/bootstrap-project.js';
import { createWebServer, type WebServerDependencies } from './app/web-server.js';
import { loadChatSettings } from './storage/chat-settings-store.js';
import { resolveRuntimeModel } from './runtime/resolve-runtime-model.js';
import { runRuntimeAgent, type RunRuntimeAgentResult } from './runtime/agent-session.js';

export interface CliDependencies {
  bootstrapProject: (root: string) => Promise<BootstrapProjectResult>;
  runRuntimeAgent: (input: Parameters<typeof runRuntimeAgent>[0]) => Promise<RunRuntimeAgentResult>;
  createWebServer?: (root: string, dependencies?: WebServerDependencies) => ReturnType<typeof createWebServer>;
}

const defaultCliDependencies: CliDependencies = {
  bootstrapProject,
  runRuntimeAgent,
  createWebServer
};

export function logDirectExecError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}

export async function main(argv = process.argv, dependencies: CliDependencies = defaultCliDependencies): Promise<void> {
  const command = argv[2];

  if (!command) {
    throw new Error('Usage: node dist/cli.js <project-root> | bootstrap <project-root> | run <project-root> <request> | serve <project-root> [port]');
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

    await dependencies.bootstrapProject(root);
    const settings = await loadChatSettings(root);
    const resolvedRuntimeModel = resolveRuntimeModel(settings, { root });
    const result = await dependencies.runRuntimeAgent({
      root,
      userRequest,
      runId: randomUUID(),
      model: resolvedRuntimeModel.model,
      getApiKey: resolvedRuntimeModel.getApiKey,
      allowQueryWriteback: settings.allow_query_writeback,
      allowLintAutoFix: settings.allow_lint_autofix
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

  if (command === 'serve') {
    const root = argv[3];
    const portValue = argv[4];

    if (!root) {
      throw new Error('Usage: node dist/cli.js serve <project-root> [port]');
    }

    const port = portValue ? Number.parseInt(portValue, 10) : 3000;

    if (!Number.isInteger(port) || port < 0) {
      throw new Error('Usage: node dist/cli.js serve <project-root> [port]');
    }

    await dependencies.bootstrapProject(root);
    const createWebServerImpl = dependencies.createWebServer ?? createWebServer;
    const server = createWebServerImpl(root, {
      runRuntimeAgent: async ({ root: projectRoot, userRequest, runId, model, getApiKey, allowQueryWriteback, allowLintAutoFix }) => {
        return dependencies.runRuntimeAgent({
          root: projectRoot,
          userRequest,
          runId,
          model,
          getApiKey,
          allowQueryWriteback,
          allowLintAutoFix
        });
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => resolve());
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine server address');
    }

    console.log(
      JSON.stringify(
        {
          root,
          port: (address as AddressInfo).port,
          url: `http://0.0.0.0:${(address as AddressInfo).port}`
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
