import { mkdir, writeFile } from 'node:fs/promises';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  artifactPath: Type.String({ description: 'Artifact path under state/artifacts/ or a project-relative state/artifacts path.' }),
  content: Type.String({ description: 'UTF-8 artifact content to persist.' }),
  overwrite: Type.Optional(Type.Boolean({ description: 'Whether an existing artifact may be overwritten.' }))
});

export type WriteArtifactParameters = Static<typeof parameters>;

export function createWriteArtifactTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'write_artifact',
    label: 'Write Artifact',
    description:
      'Write a runtime artifact under state/artifacts for long-form notes, receipts, and intermediate outputs.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolved = resolveStateArtifactPath(runtimeContext.root, params.artifactPath);
      const overwrite = params.overwrite ?? false;
      await mkdir(new URL('.', `file://${resolved.absolutePath}`), { recursive: true });

      try {
        await writeFile(resolved.absolutePath, params.content, {
          encoding: 'utf8',
          flag: overwrite ? 'w' : 'wx'
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
          throw new Error(`Artifact already exists: ${resolved.artifactPath}`);
        }

        throw error;
      }

      const outcome: RuntimeToolOutcome = {
        toolName: 'write_artifact',
        summary: `wrote artifact ${resolved.artifactPath}`,
        evidence: [resolved.absolutePath],
        touchedFiles: [resolved.projectPath],
        data: {
          artifactPath: resolved.artifactPath,
          projectPath: resolved.projectPath,
          overwrite
        },
        resultMarkdown: `Wrote artifact: ${resolved.projectPath}`
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}
