import { describe, expect, it } from 'vitest';

import { createChatSettings } from '../../src/domain/chat-settings.js';

describe('createChatSettings', () => {
  it('creates default chat settings', () => {
    expect(createChatSettings()).toEqual({
      model: 'gpt-5.4',
      provider: 'llm-wiki-liiy',
      api: 'anthropic-messages',
      base_url: 'http://runtime.example.invalid/v1',
      api_key_env: 'RUNTIME_API_KEY',
      reasoning: true,
      allow_query_writeback: false,
      allow_lint_autofix: false
    });
  });

  it('normalizes optional runtime model settings', () => {
    expect(
      createChatSettings({
        model: '  gpt-5.4  ',
        provider: '  llm-wiki-liiy  ',
        api: 'anthropic-messages',
        base_url: '  http://runtime.example.invalid/v1  ',
        api_key_env: '  RUNTIME_API_KEY  ',
        reasoning: true,
        context_window: 256000,
        max_tokens: 32768,
        allow_query_writeback: true
      })
    ).toEqual({
      model: 'gpt-5.4',
      provider: 'llm-wiki-liiy',
      api: 'anthropic-messages',
      base_url: 'http://runtime.example.invalid/v1',
      api_key_env: 'RUNTIME_API_KEY',
      reasoning: true,
      context_window: 256000,
      max_tokens: 32768,
      allow_query_writeback: true,
      allow_lint_autofix: false
    });
  });

  it('preserves a scheme-less custom base URL exactly as saved in settings', () => {
    expect(
      createChatSettings({
        model: 'claude-haiku-4-5',
        provider: 'anthropic',
        api: 'anthropic-messages',
        base_url: '  runtime.example.invalid/v1  ',
        api_key_env: 'RUNTIME_API_KEY',
        reasoning: false
      })
    ).toEqual({
      model: 'claude-haiku-4-5',
      provider: 'anthropic',
      api: 'anthropic-messages',
      base_url: 'runtime.example.invalid/v1',
      api_key_env: 'RUNTIME_API_KEY',
      reasoning: false,
      allow_query_writeback: false,
      allow_lint_autofix: false
    });
  });
});
