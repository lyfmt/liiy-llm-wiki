import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getProviders } from '@mariozechner/pi-ai';

import { createChatSettings } from '../../src/domain/chat-settings.js';
import { listRuntimeModelCatalog, resolveRuntimeModel } from '../../src/runtime/resolve-runtime-model.js';

describe('resolveRuntimeModel', () => {
  afterEach(() => {
    delete process.env.RUNTIME_TEST_API_KEY;
    delete process.env.RUNTIME_API_KEY;
  });

  it('uses the project default Claude-compatible runtime settings by default', () => {
    const resolved = resolveRuntimeModel();

    expect(resolved.model.provider).toBe('llm-wiki-liiy');
    expect(resolved.model.id).toBe('gpt-5.4');
    expect(resolved.model.api).toBe('anthropic-messages');
    expect(resolved.model.baseUrl).toBe('http://runtime.example.invalid');
    expect(resolved.model.reasoning).toBe(true);
  });

  it('builds a custom Claude-native compatible model from chat settings and resolves env api keys', () => {
    process.env.RUNTIME_TEST_API_KEY = 'test-key';
    const resolved = resolveRuntimeModel(
      createChatSettings({
        model: 'gpt-5.4',
        provider: 'llm-wiki-liiy',
        api: 'anthropic-messages',
        base_url: 'http://runtime.example.invalid/v1',
        api_key_env: 'RUNTIME_TEST_API_KEY',
        reasoning: true,
        context_window: 256000,
        max_tokens: 32768
      })
    );

    expect(resolved.model.provider).toBe('llm-wiki-liiy');
    expect(resolved.model.id).toBe('gpt-5.4');
    expect(resolved.model.api).toBe('anthropic-messages');
    expect(resolved.model.baseUrl).toBe('http://runtime.example.invalid');
    expect(resolved.model.reasoning).toBe(true);
    expect(resolved.model.contextWindow).toBe(256000);
    expect(resolved.model.maxTokens).toBe(32768);
    expect(resolved.getApiKey('llm-wiki-liiy')).toBe('test-key');
  });

  it('normalizes a scheme-less Claude-compatible base URL for runtime requests', () => {
    const resolved = resolveRuntimeModel(
      createChatSettings({
        model: 'claude-haiku-4-5',
        provider: 'anthropic',
        api: 'anthropic-messages',
        base_url: 'runtime.example.invalid/v1',
        api_key_env: 'RUNTIME_TEST_API_KEY',
        reasoning: false
      })
    );

    expect(resolved.model.provider).toBe('anthropic');
    expect(resolved.model.id).toBe('claude-haiku-4-5');
    expect(resolved.model.api).toBe('anthropic-messages');
    expect(resolved.model.baseUrl).toBe('http://runtime.example.invalid');
  });

  it('reads configured API keys from the project .env file before process env fallback', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-model-'));

    try {
      process.env.RUNTIME_API_KEY = 'process-key';
      await writeFile(path.join(root, '.env'), 'RUNTIME_API_KEY=dotenv-key\n', 'utf8');
      const resolved = resolveRuntimeModel(
        createChatSettings({
          model: 'gpt-5.4',
          provider: 'llm-wiki-liiy',
          api: 'anthropic-messages',
          base_url: 'http://runtime.example.invalid/v1',
          api_key_env: 'RUNTIME_API_KEY'
        }),
        { root }
      );

      expect(resolved.getApiKey('llm-wiki-liiy')).toBe('dotenv-key');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not fall back to process env when a project root is provided but the configured key is absent from .env', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-model-'));

    try {
      process.env.RUNTIME_API_KEY = 'process-key';
      await writeFile(path.join(root, '.env'), 'OTHER_KEY=present\n', 'utf8');
      const resolved = resolveRuntimeModel(
        createChatSettings({
          model: 'gpt-5.4',
          provider: 'llm-wiki-liiy',
          api: 'anthropic-messages',
          api_key_env: 'RUNTIME_API_KEY'
        }),
        { root }
      );

      expect(resolved.getApiKey('llm-wiki-liiy')).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not fall back to a legacy compatibility env when the configured env is missing in project .env', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-model-'));

    try {
      await writeFile(path.join(root, '.env'), 'OTHER_KEY=present\n', 'utf8');
      const resolved = resolveRuntimeModel(
        createChatSettings({
          model: 'gpt-5.4',
          provider: 'llm-wiki-liiy',
          api: 'anthropic-messages',
          api_key_env: 'RUNTIME_API_KEY'
        }),
        { root }
      );

      expect(resolved.getApiKey('llm-wiki-liiy')).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lists runtime model providers with the local default provider and preserves a selected custom model', () => {
    const catalog = listRuntimeModelCatalog(
      createChatSettings({
        model: 'custom-sonnet',
        provider: 'llm-wiki-liiy',
        api: 'anthropic-messages',
        base_url: 'http://runtime.example.invalid/v1',
        api_key_env: 'RUNTIME_API_KEY',
        reasoning: false,
        context_window: 64000,
        max_tokens: 4096
      })
    );

    expect(catalog.defaultProvider).toBe('llm-wiki-liiy');
    expect(catalog.providers[0]).toMatchObject({
      id: 'llm-wiki-liiy'
    });
    expect(catalog.providers[0]?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gpt-5.4',
          provider: 'llm-wiki-liiy',
          selected: false
        }),
        expect.objectContaining({
          id: 'custom-sonnet',
          provider: 'llm-wiki-liiy',
          selected: true,
          built_in: false,
          api: 'anthropic-messages',
          base_url: 'http://runtime.example.invalid',
          api_key_env: 'RUNTIME_API_KEY',
          reasoning: false,
          context_window: 64000,
          max_tokens: 4096
        })
      ])
    );
    expect(catalog.selected).toMatchObject({
      provider: 'llm-wiki-liiy',
      model: 'custom-sonnet',
      api: 'anthropic-messages',
      base_url: 'http://runtime.example.invalid/v1',
      api_key_env: 'RUNTIME_API_KEY',
      reasoning: false,
      context_window: 64000,
      max_tokens: 4096
    });
  });

  it('keeps the built-in selected model row canonical while preserving persisted overrides in selected metadata', () => {
    const catalog = listRuntimeModelCatalog(
      createChatSettings({
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        api: 'openai-responses',
        base_url: 'https://example.test/v1',
        api_key_env: 'ANTHROPIC_CUSTOM_KEY',
        reasoning: false,
        context_window: 123456,
        max_tokens: 2345
      })
    );

    expect(catalog.providers.find((provider) => provider.id === 'anthropic')?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
          selected: true,
          built_in: true,
          api: 'anthropic-messages',
          base_url: 'https://api.anthropic.com',
          reasoning: true,
          context_window: 200000,
          max_tokens: 64000
        })
      ])
    );
    expect(catalog.selected).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      api: 'openai-responses',
      base_url: 'https://example.test/v1',
      api_key_env: 'ANTHROPIC_CUSTOM_KEY',
      reasoning: false,
      context_window: 123456,
      max_tokens: 2345
    });
  });

  it('derives known provider support from the runtime provider list', () => {
    const catalog = listRuntimeModelCatalog(
      createChatSettings({
        model: 'gpt-5.4',
        provider: 'llm-wiki-liiy'
      })
    );

    const discoveredProviderIds = catalog.providers.map((provider) => provider.id);

    for (const provider of getProviders()) {
      expect(discoveredProviderIds).toContain(provider);
    }
  });
});
