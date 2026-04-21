import { readFile } from 'node:fs/promises';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  artifactPath: Type.String({ description: 'Artifact path under state/artifacts/ or a project-relative state/artifacts path.' })
});

export type ReadArtifactParameters = Static<typeof parameters>;

export function createReadArtifactTool(runtimeContext: RuntimeContext): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'read_artifact',
    label: 'Read Artifact',
    description:
      'Read a runtime artifact from state/artifacts when the task needs long-form context or a persisted receipt.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolved = resolveStateArtifactPath(runtimeContext.root, params.artifactPath);
      const content = await readFile(resolved.absolutePath, 'utf8');
      const outcome: RuntimeToolOutcome = {
        toolName: 'read_artifact',
        summary: `read artifact ${resolved.artifactPath}`,
        evidence: [resolved.absolutePath],
        touchedFiles: [],
        data: {
          artifactPath: resolved.artifactPath,
          projectPath: resolved.projectPath
        },
        resultMarkdown: content
      };

      return {
        content: [{ type: 'text', text: content }],
        details: outcome
      };
    }
  };
}
