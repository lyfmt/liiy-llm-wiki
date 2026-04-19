import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { discoverRuntimeSkills } from '../../../src/runtime/skills/discovery.js';

describe('discoverRuntimeSkills', () => {
  it('loads project skills from .agents/skills and extracts name plus description', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-skill-discovery-'));

    try {
      const skillDirectory = path.join(root, '.agents', 'skills', 'source-to-wiki');
      await mkdir(skillDirectory, { recursive: true });
      await writeFile(
        path.join(skillDirectory, 'SKILL.md'),
        `---
name: source-to-wiki
description: Turn source material into governed wiki drafts.
allowed-tools: read_source_manifest read_raw_source draft_knowledge_page apply_draft_upsert
---

# Source To Wiki

Use this skill when the user wants to add uploaded source material into the wiki.
`,
        'utf8'
      );

      const result = await discoverRuntimeSkills(root);

      expect(result.skills).toEqual([
        expect.objectContaining({
          name: 'source-to-wiki',
          description: 'Turn source material into governed wiki drafts.',
          allowedTools: ['read_source_manifest', 'read_raw_source', 'draft_knowledge_page', 'apply_draft_upsert'],
          filePath: path.join(skillDirectory, 'SKILL.md'),
          baseDir: skillDirectory
        })
      ]);
      expect(result.diagnostics).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores skill directories without valid description', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-skill-discovery-'));

    try {
      const skillDirectory = path.join(root, '.agents', 'skills', 'broken-skill');
      await mkdir(skillDirectory, { recursive: true });
      await writeFile(
        path.join(skillDirectory, 'SKILL.md'),
        `---
name: broken-skill
---

# Broken Skill
`,
        'utf8'
      );

      const result = await discoverRuntimeSkills(root);

      expect(result.skills).toEqual([]);
      expect(result.diagnostics[0]?.message).toContain('description');
      expect(result.diagnostics[0]?.path).toBe(path.join(skillDirectory, 'SKILL.md'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
