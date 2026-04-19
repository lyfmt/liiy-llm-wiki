import { describe, expect, it } from 'vitest';

import { formatSkillsForPrompt } from '../../../src/runtime/skills/format.js';

describe('formatSkillsForPrompt', () => {
  it('renders a compact available-skills section for the runtime prompt', () => {
    const text = formatSkillsForPrompt([
      {
        name: 'source-to-wiki',
        description: 'Turn source material into governed wiki drafts.',
        allowedTools: [],
        filePath: '/project/.agents/skills/source-to-wiki/SKILL.md',
        baseDir: '/project/.agents/skills/source-to-wiki'
      }
    ]);

    expect(text).toContain('source-to-wiki');
    expect(text).toContain('Turn source material');
    expect(text).toContain('SKILL.md');
  });

  it('renders an explicit empty-state marker when no skills are available', () => {
    expect(formatSkillsForPrompt([])).toContain('no project skills available');
  });
});
