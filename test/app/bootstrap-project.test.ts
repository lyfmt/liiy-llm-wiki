import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../src/app/bootstrap-project.js';

describe('bootstrapProject', () => {
  it('creates the minimal directory bootstrap', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-liiy-'));

    try {
      const result = await bootstrapProject(root);

      expect(result.directories.map((directory) => path.relative(root, directory))).toEqual(
        expect.arrayContaining([
          'raw',
          path.join('raw', 'inbox'),
          path.join('raw', 'accepted'),
          path.join('raw', 'rejected'),
          'wiki',
          path.join('wiki', 'sources'),
          path.join('wiki', 'entities'),
          path.join('wiki', 'topics'),
          path.join('wiki', 'queries'),
          'schema',
          'state',
          path.join('state', 'runs'),
          path.join('state', 'checkpoints'),
          path.join('state', 'drafts'),
          path.join('state', 'artifacts'),
          path.join('state', 'artifacts', 'tasks'),
          'docs',
          path.join('docs', 'superpowers'),
          path.join('docs', 'superpowers', 'specs')
        ])
      );

      await expect(access(path.join(root, 'wiki', 'topics'))).resolves.toBeUndefined();
      await expect(access(path.join(root, 'state', 'artifacts'))).resolves.toBeUndefined();
      await expect(access(path.join(root, 'docs', 'superpowers', 'specs'))).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates starter wiki and schema markdown files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-liiy-'));

    try {
      const result = await bootstrapProject(root);

      expect(result.files).toEqual(
        expect.arrayContaining([
          path.join(root, 'wiki', 'index.md'),
          path.join(root, 'wiki', 'log.md'),
          path.join(root, 'schema', 'agent-rules.md'),
          path.join(root, 'schema', 'page-types.md'),
          path.join(root, 'schema', 'update-policy.md'),
          path.join(root, 'schema', 'review-gates.md'),
          path.join(root, 'state', 'artifacts', 'chat-settings.json'),
          path.join(root, '.env')
        ])
      );
      expect(result.files).toHaveLength(8);

      const indexContent = await readFile(path.join(root, 'wiki', 'index.md'), 'utf8');
      const pageTypesContent = await readFile(path.join(root, 'schema', 'page-types.md'), 'utf8');
      const updatePolicyContent = await readFile(path.join(root, 'schema', 'update-policy.md'), 'utf8');
      const reviewGatesContent = await readFile(path.join(root, 'schema', 'review-gates.md'), 'utf8');
      const chatSettingsContent = await readFile(path.join(root, 'state', 'artifacts', 'chat-settings.json'), 'utf8');
      const envContent = await readFile(path.join(root, '.env'), 'utf8');

      expect(indexContent).toContain('# Wiki Index');
      expect(indexContent).toContain('- [Sources](sources/)');
      expect(pageTypesContent).toContain('- sources/: single-source summary pages.');
      expect(updatePolicyContent).toContain('- Maintain wiki/index.md as a structured navigation page.');
      expect(updatePolicyContent).toContain(
        '- Preserve conflicts with their supporting evidence instead of flattening them away.'
      );
      expect(reviewGatesContent).toContain('High-impact actions require review before applying changes:');
      expect(reviewGatesContent).toContain('重写核心 topic 页');
      expect(reviewGatesContent).toContain('删除页面');
      expect(reviewGatesContent).toContain('合并或拆分关键实体');
      expect(reviewGatesContent).toContain('修改 schema 规则');
      expect(reviewGatesContent).toContain('涉及多个主题页的基础判断变化');
      expect(reviewGatesContent).toContain('存在明显证据冲突但无法自动决断');
      expect(chatSettingsContent).toContain('"model": "gpt-5.4"');
      expect(chatSettingsContent).toContain('"provider": "llm-wiki-liiy"');
      expect(chatSettingsContent).toContain('"api_key_env": "RUNTIME_API_KEY"');
      expect(envContent).toBe('RUNTIME_API_KEY=\n');
      await expect(access(path.join(root, '.env'))).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing scaffold file on rerun', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-liiy-'));

    try {
      const firstRun = await bootstrapProject(root);
      await writeFile(path.join(root, 'wiki', 'index.md'), '# Custom Index\n');

      const secondRun = await bootstrapProject(root);

      expect(firstRun.files).toHaveLength(8);
      expect(secondRun.files).toEqual([]);
      await expect(readFile(path.join(root, 'wiki', 'index.md'), 'utf8')).resolves.toBe('# Custom Index\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
