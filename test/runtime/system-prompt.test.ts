import { describe, expect, it } from 'vitest';

import { buildRuntimeSystemPrompt } from '../../src/runtime/system-prompt.js';

describe('buildRuntimeSystemPrompt', () => {
  it('tells the model to distinguish knowledge-seeking requests from ordinary chat', () => {
    const prompt = buildRuntimeSystemPrompt('general');

    expect(prompt).toContain('decide whether the user is seeking knowledge or simply having an ordinary conversation');
    expect(prompt).toContain('For greetings, test inputs, lightweight follow-ups, coordination, or meta questions about the interaction itself, respond directly.');
  });

  it('adds a hard fallback rule for knowledge-seeking questions', () => {
    const prompt = buildRuntimeSystemPrompt('query');

    expect(prompt).toContain('If the request is knowledge-seeking, do not rely purely on internal memory by default.');
    expect(prompt).toContain('perform a minimal wiki navigation pass before answering or before saying the answer is unknown');
  });

  it('defines minimal retrieval as list-first and not list-then-read by default', () => {
    const prompt = buildRuntimeSystemPrompt('query');

    expect(prompt).toContain('Usually this means starting with list_wiki_pages');
    expect(prompt).toContain('Do not automatically continue to read_wiki_page after listing.');
    expect(prompt).toContain('A page listing is itself evidence about whether the wiki likely contains relevant knowledge.');
  });

  it('injects available project skill summaries without inlining full skill bodies', () => {
    const prompt = buildRuntimeSystemPrompt('mixed', {
      skills: [
        {
          name: 'source-to-wiki',
          description: 'Turn source material into governed wiki drafts.',
          allowedTools: [],
          filePath: '/project/.agents/skills/source-to-wiki/SKILL.md',
          baseDir: '/project/.agents/skills/source-to-wiki'
        }
      ]
    });

    expect(prompt).toContain('# Available Skills');
    expect(prompt).toContain('source-to-wiki');
    expect(prompt).toContain('Turn source material into governed wiki drafts.');
    expect(prompt).not.toContain('# Source To Wiki');
  });
});
