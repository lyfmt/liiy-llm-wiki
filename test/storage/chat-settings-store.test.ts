import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createChatSettings } from '../../src/domain/chat-settings.js';
import { loadChatSettings, saveChatSettings } from '../../src/storage/chat-settings-store.js';

describe('chat-settings-store', () => {
  it('returns default settings when no file exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-chat-settings-'));

    try {
      expect(await loadChatSettings(root)).toEqual(createChatSettings());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('saves and loads settings', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-chat-settings-'));

    try {
      const settings = createChatSettings({
        model: 'gpt-5.4',
        provider: 'llm-wiki-liiy',
        api: 'anthropic-messages',
        base_url: 'http://runtime.example.invalid/v1',
        api_key_env: 'RUNTIME_API_KEY',
        reasoning: true,
        context_window: 256000,
        max_tokens: 32768,
        allow_query_writeback: true,
        allow_lint_autofix: true
      });
      const filePath = await saveChatSettings(root, settings);

      expect(filePath).toBe(path.join(root, 'state', 'artifacts', 'chat-settings.json'));
      expect(await loadChatSettings(root)).toEqual(settings);
      const fileContents = await readFile(filePath, 'utf8');
      expect(fileContents).toContain('"model": "gpt-5.4"');
      expect(fileContents).toContain('"provider": "llm-wiki-liiy"');
      expect(fileContents).toContain('"api_key_env": "RUNTIME_API_KEY"');
      await expect(readFile(path.join(root, '.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed settings files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-chat-settings-'));
    const filePath = path.join(root, 'state', 'artifacts', 'chat-settings.json');

    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, '{"model":1}\n', 'utf8');

      await expect(loadChatSettings(root)).rejects.toThrow('Invalid chat settings: invalid chat-settings.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
