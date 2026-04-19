import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createReadSkillTool } from '../../../src/runtime/tools/read-skill.js';

describe('createReadSkillTool', () => {
  it('reads the full SKILL.md for a discovered skill', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-read-skill-'));

    try {
      const skillDirectory = path.join(root, '.agents', 'skills', 'source-to-wiki');
      const skillPath = path.join(skillDirectory, 'SKILL.md');
      await mkdir(skillDirectory, { recursive: true });
      await writeFile(
        skillPath,
        `---
name: source-to-wiki
description: Turn source material into governed wiki drafts.
---

# Source To Wiki

## Flow

Use the registered source and wiki tools together.
`,
        'utf8'
      );
      const tool = createReadSkillTool(
        createRuntimeContext({
          root,
          runId: 'runtime-read-skill-001'
        }),
        {
          skills: [
            {
              name: 'source-to-wiki',
              description: 'Turn source material into governed wiki drafts.',
              allowedTools: [],
              filePath: skillPath,
              baseDir: skillDirectory
            }
          ]
        }
      );

      const result = await tool.execute('tool-call-1', { name: 'source-to-wiki' });

      expect(result.details.summary).toBe('read skill source-to-wiki');
      expect(result.details.resultMarkdown).toContain('# Source To Wiki');
      expect(result.details.evidence).toEqual([skillPath]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
