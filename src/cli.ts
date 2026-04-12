import { pathToFileURL } from 'node:url';

import { bootstrapProject } from './app/bootstrap-project.js';

export function logDirectExecError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}

export async function main(argv = process.argv): Promise<void> {
  const root = argv[2];

  if (!root) {
    throw new Error('Usage: node dist/cli.js <project-root>');
  }

  const result = await bootstrapProject(root);

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
