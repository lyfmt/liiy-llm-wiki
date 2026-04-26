import { Cpu, RefreshCw, Save, Server, Key } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ZipTopNav } from '@/components/layout/template-primitives';
import { getChatModels, getChatSettings, updateChatSettings } from '@/lib/api';
import type { ChatSettingsUpdateRequest, ChatModelsResponse } from '@/lib/types';

const defaultFormState: ChatSettingsUpdateRequest = {
  model: '',
  provider: '',
  api: 'anthropic-messages',
  base_url: '',
  api_key_env: 'RUNTIME_API_KEY',
  project_env_contents: '',
  reasoning: true
};

type RuntimeOverrideInheritance = {
  api: boolean;
  base_url: boolean;
};

export function ConsolePage() {
  const [modelsResponse, setModelsResponse] = useState<ChatModelsResponse | null>(null);
  const [inheritedRuntimeFields, setInheritedRuntimeFields] = useState<RuntimeOverrideInheritance>({
    api: true,
    base_url: true
  });
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({});
  const [projectEnvContents, setProjectEnvContents] = useState('');
  const [formState, setFormState] = useState<ChatSettingsUpdateRequest>(defaultFormState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showEndpointModal, setShowEndpointModal] = useState(false);

  const currentApiKeyEnv = formState.api_key_env || modelsResponse?.selected.api_key_env || 'RUNTIME_API_KEY';
  const apiKey = apiKeyDrafts[currentApiKeyEnv] ?? '';

  const readEnvAssignment = (line: string, targetKey: string) => {
    const match = line.match(/^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)(\s*=)(.*)$/);
    if (!match) {
      return null;
    }

    const [, leadingWhitespace, exportPrefix = '', key, equalsWithSpacing, value] = match;
    if (key !== targetKey) {
      return null;
    }

    return {
      leadingWhitespace,
      exportPrefix,
      key,
      equalsWithSpacing,
      value
    };
  };

  const extractKey = (contents: string, targetKey: string) => {
    for (const line of contents.split('\n')) {
      const assignment = readEnvAssignment(line, targetKey);
      if (assignment) {
        return assignment.value;
      }
    }
    return '';
  };

  const updateContentsWithKey = (contents: string, targetKey: string, newValue: string) => {
    const lines = contents.split('\n');
    let found = false;
    const updatedLines = lines.map((line) => {
      const assignment = readEnvAssignment(line, targetKey);
      if (!assignment) {
        return line;
      }

      found = true;
      return `${assignment.leadingWhitespace}${assignment.exportPrefix}${assignment.key}${assignment.equalsWithSpacing}${newValue}`;
    });

    if (!found) {
      updatedLines.push(`${targetKey}=${newValue}`);
    }

    return updatedLines.join('\n');
  };

  const getDraftApiKey = (contents: string, targetKey: string) => apiKeyDrafts[targetKey] ?? extractKey(contents, targetKey);

  const normalizeRuntimeBaseUrl = (baseUrl: string, api: ChatSettingsUpdateRequest['api']) => {
    if (!baseUrl.trim()) {
      return '';
    }

    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(baseUrl) ? baseUrl : `http://${baseUrl.replace(/^\/+/, '')}`;

    return api === 'anthropic-messages' ? withScheme.replace(/\/v1\/?$/u, '') : withScheme;
  };

  async function loadAll(options?: { discover?: boolean }) {
    if (options?.discover) {
      setDiscovering(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [settingsValue, modelsValue] = await Promise.all([
        getChatSettings(),
        getChatModels(options?.discover ? {
          discover: true,
          provider: formState.provider,
          api: formState.api,
          base_url: formState.base_url,
          api_key_env: formState.api_key_env
        } : undefined)
      ]);
      setModelsResponse(modelsValue);
      const contents = settingsValue.project_env.contents;
      setProjectEnvContents(contents);
      const selectedModel = modelsValue.selected;
      const selectedProviderId = settingsValue.settings.provider || selectedModel.provider || modelsValue.default_provider;
      const selectedModelId = settingsValue.settings.model || selectedModel.model;
      const selectedCatalogModel = modelsValue.providers
        .find((providerData) => providerData.id === selectedProviderId)
        ?.models.find((modelData) => modelData.id === selectedModelId);
      const targetKey = settingsValue.settings.api_key_env || selectedModel.api_key_env || 'RUNTIME_API_KEY';
      const resolvedApi = settingsValue.settings.api ?? selectedModel.api;
      const resolvedBaseUrl = settingsValue.settings.base_url ?? selectedModel.base_url ?? '';

      setApiKeyDrafts((current) => ({
        ...current,
        [targetKey]: getDraftApiKey(contents, targetKey)
      }));
      setInheritedRuntimeFields({
        api: selectedCatalogModel ? resolvedApi === selectedCatalogModel.api : false,
        base_url: selectedCatalogModel
          ? normalizeRuntimeBaseUrl(resolvedBaseUrl, resolvedApi) === normalizeRuntimeBaseUrl(selectedCatalogModel.base_url, selectedCatalogModel.api)
          : false
      });
      setFormState({
        model: selectedModelId,
        provider: selectedProviderId,
        api: resolvedApi,
        base_url: resolvedBaseUrl,
        api_key_env: targetKey,
        project_env_contents: contents,
        reasoning: settingsValue.settings.reasoning ?? selectedModel.reasoning ?? true,
        context_window: settingsValue.settings.context_window ?? selectedModel.context_window,
        max_tokens: settingsValue.settings.max_tokens ?? selectedModel.max_tokens,
        allow_query_writeback: settingsValue.settings.allow_query_writeback,
        allow_lint_autofix: settingsValue.settings.allow_lint_autofix
      });

      if (options?.discover) {
        if (modelsValue.discovery.error) {
          setError(`探测失败: ${modelsValue.discovery.error}`);
        } else {
          setMessage('模型探测成功。');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
      setDiscovering(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const provider = formState.provider?.trim() || modelsResponse?.selected.provider || modelsResponse?.default_provider || 'llm-wiki-liiy';
  const modelOptions = useMemo(() => {
    if (!modelsResponse) return [];
    const providerData = modelsResponse.providers.find((p) => p.id === provider);
    const presets = providerData?.models.map((m) => m.id) ?? [];
    const current = formState.model?.trim();
    return current && !presets.includes(current) ? [current, ...presets] : presets;
  }, [formState.model, provider, modelsResponse]);

  const resolveNextRuntimeSettings = ({
    nextApi,
    nextBaseUrl,
    currentApi,
    currentBaseUrl
  }: {
    nextApi?: ChatSettingsUpdateRequest['api'];
    nextBaseUrl?: string;
    currentApi?: ChatSettingsUpdateRequest['api'];
    currentBaseUrl?: string;
  }): Pick<ChatSettingsUpdateRequest, 'api' | 'base_url'> => ({
    api: inheritedRuntimeFields.api ? (nextApi ?? currentApi ?? defaultFormState.api) : (currentApi ?? defaultFormState.api),
    base_url: inheritedRuntimeFields.base_url ? (nextBaseUrl ?? '') : (currentBaseUrl ?? '')
  });

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const targetKey = formState.api_key_env || 'RUNTIME_API_KEY';
      const finalContents = updateContentsWithKey(projectEnvContents, targetKey, apiKey);
      const payload: ChatSettingsUpdateRequest = {
        ...formState,
        api_key_env: targetKey,
        project_env_contents: finalContents
      };
      await updateChatSettings(payload);
      setMessage('配置已保存。用户密钥已生效。');
      await loadAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <ZipTopNav active="settings" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-24">
        <header className="mb-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand">Settings</p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">模型访问配置</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">配置 LLM 服务商、模型、API 端点与项目密钥。</p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
          className="space-y-8 rounded-[8px] border border-slate-200 bg-white p-6 shadow-sm md:p-8"
        >
          <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-blue-50 text-brand">
              <Cpu size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">运行时配置</h2>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">正在加载配置…</div>
          ) : (
            <div className="space-y-8">
              <input
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                name="username"
                autoComplete="username"
                value={provider}
                readOnly
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="chat-provider" className="mb-2 block text-sm font-bold text-slate-900">提供商</label>
                  <select
                    id="chat-provider"
                    name="provider"
                    value={formState.provider || ''}
                    onChange={(event) => {
                      const newProvider = event.target.value;
                      const providerData = modelsResponse?.providers.find((p) => p.id === newProvider);
                      const firstModel = providerData?.models[0];
                      const newApiKeyEnv = firstModel?.api_key_env || formState.api_key_env || 'RUNTIME_API_KEY';

                      setApiKeyDrafts((current) => ({
                        ...current,
                        [newApiKeyEnv]: current[newApiKeyEnv] ?? getDraftApiKey(projectEnvContents, newApiKeyEnv)
                      }));
                      setFormState((current) => {
                        const runtimeSettings = resolveNextRuntimeSettings({
                          nextApi: firstModel?.api,
                          nextBaseUrl: firstModel?.base_url,
                          currentApi: current.api,
                          currentBaseUrl: current.base_url
                        });

                        return {
                          ...current,
                          provider: newProvider,
                          model: firstModel?.id ?? current.model,
                          ...runtimeSettings,
                          api_key_env: newApiKeyEnv,
                          reasoning: firstModel?.reasoning ?? current.reasoning,
                          context_window: firstModel?.context_window ?? current.context_window,
                          max_tokens: firstModel?.max_tokens ?? current.max_tokens
                        };
                      });
                    }}
                    className="w-full cursor-pointer appearance-none rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-colors focus:border-blue-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {modelsResponse?.providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="chat-api-key" className="mb-2 block text-sm font-bold text-slate-900">API 密钥</label>
                  <div className="relative">
                    <input
                      id="chat-api-key"
                      name="api_key"
                      type="password"
                      autoComplete="new-password"
                      value={apiKey}
                      onChange={(event) =>
                        setApiKeyDrafts((current) => ({
                          ...current,
                          [currentApiKeyEnv]: event.target.value
                        }))
                      }
                      placeholder="sk-..."
                      className="w-full rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <Key size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="chat-model" className="mb-2 block text-sm font-bold text-slate-900">模型</label>
                <div className="flex gap-4 items-center">
                  <select
                    id="chat-model"
                    name="model"
                    value={formState.model ?? ''}
                    onChange={(event) => {
                      const newModelId = event.target.value;
                      const providerData = modelsResponse?.providers.find((p) => p.id === provider);
                      const modelData = providerData?.models.find((m) => m.id === newModelId);
                      const newApiKeyEnv = modelData?.api_key_env || formState.api_key_env || 'RUNTIME_API_KEY';

                      setApiKeyDrafts((current) => ({
                        ...current,
                        [newApiKeyEnv]: current[newApiKeyEnv] ?? getDraftApiKey(projectEnvContents, newApiKeyEnv)
                      }));
                      setFormState((current) => {
                        const runtimeSettings = resolveNextRuntimeSettings({
                          nextApi: modelData?.api,
                          nextBaseUrl: modelData?.base_url,
                          currentApi: current.api,
                          currentBaseUrl: current.base_url
                        });

                        return {
                          ...current,
                          model: newModelId,
                          ...runtimeSettings,
                          api_key_env: newApiKeyEnv,
                          reasoning: modelData?.reasoning ?? current.reasoning,
                          context_window: modelData?.context_window ?? current.context_window,
                          max_tokens: modelData?.max_tokens ?? current.max_tokens
                        };
                      });
                    }}
                    className="flex-1 cursor-pointer appearance-none rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-colors focus:border-blue-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {modelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void loadAll({ discover: true })}
                    disabled={discovering || loading}
                    className="flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border border-blue-100 bg-white px-5 py-3 text-sm font-bold text-brand transition-colors hover:bg-blue-50 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={discovering ? 'animate-spin' : ''} /> {discovering ? '正在探测...' : '探测并刷新模型'}
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowEndpointModal(true)}
                  className="flex items-center gap-2 text-sm font-medium text-brand transition-colors hover:text-blue-700"
                >
                  <Server size={14} />
                  {formState.base_url?.trim() ? `自定义端点: ${formState.base_url}` : '配置自定义 API 端点'}
                </button>
              </div>

              {error ? <div className="rounded-[8px] border border-red-100 bg-red-50 p-4 text-sm text-red-600">{error}</div> : null}
              {message ? <div className="rounded-[8px] border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-brand">{message}</div> : null}
            </div>
          )}

          <div className="mt-10 flex justify-end border-t border-slate-100 pt-6">
            <button
              type="submit"
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-[8px] bg-brand px-8 py-3 text-sm font-bold text-white shadow-brand-soft transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              <Save size={16} /> {saving ? '保存中…' : '保存设置'}
            </button>
          </div>
        </form>
      </main>

      {showEndpointModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md rounded-[8px] border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
              <Server size={18} className="text-brand" /> 自定义 API 端点
            </h3>
            <input
              id="chat-base-url"
              name="base_url"
              type="text"
              value={formState.base_url ?? ''}
              onChange={(event) => {
                setInheritedRuntimeFields((current) => ({ ...current, base_url: false }));
                setFormState((current) => ({ ...current, base_url: event.target.value }));
              }}
              placeholder="例如: https://api.openai.com/v1"
              className="mb-8 w-full rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-colors focus:border-blue-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowEndpointModal(false)} className="rounded-[8px] px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900">取消</button>
              <button onClick={() => setShowEndpointModal(false)} className="rounded-[8px] bg-brand px-8 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700">确认</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
