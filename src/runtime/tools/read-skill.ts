import { readFile } from 'node:fs/promises';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import type { SkillSummary } from '../skills/types.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  name: Type.String({ description: 'Skill name to load from the discovered project skills registry.' })
});

export type ReadSkillParameters = Static<typeof parameters>;

export function createReadSkillTool(
  _runtimeContext: RuntimeContext,
  input: { skills: SkillSummary[] }
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'read_skill',
    label: 'Read Skill',
    description:
      'Load the full SKILL.md instructions for a discovered project skill when the summary suggests it is relevant.',
    parameters,
    execute: async (_toolCallId, params) => {
      const skill = input.skills.find((candidate) => candidate.name === params.name);

      if (!skill) {
        throw new Error(`Unknown skill: ${params.name}`);
      }

      const source = await readFile(skill.filePath, 'utf8');
      const resultMarkdown = [`Skill: ${skill.name}`, `Path: ${skill.filePath}`, '', source.trim()].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'read_skill',
        summary: `read skill ${skill.name}`,
        evidence: [skill.filePath],
        touchedFiles: [],
        data: {
          name: skill.name,
          filePath: skill.filePath,
          baseDir: skill.baseDir
        },
        resultMarkdown
      };

      return {
        content: [{ type: 'text', text: resultMarkdown }],
        details: outcome
      };
    }
  };
}
