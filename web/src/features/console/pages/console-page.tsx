import { Cpu, Home, RefreshCw, Save, Server, Shield, ShieldCheck, Key } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [settingsValue, modelsValue] = await Promise.all([getChatSettings(), getChatModels()]);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-gradient-to-br from-[#FFFFFF] to-[#F0F8FF] flex font-sans">
      <aside className="w-[280px] bg-white/80 backdrop-blur-md h-screen fixed left-0 top-0 p-6 flex flex-col border-r border-white/50 shadow-[4px_0_24px_rgba(102,204,255,0.05)] z-10">
        <a href="/app" className="flex items-center gap-2 text-[#5D6D7E] hover:text-[#66CCFF] font-bold mb-10 transition-colors w-fit">
          <Home size={18} /> 返回主页
        </a>

        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Shield size={14} /> 后台管理
        </h4>

        <div className="mt-auto flex flex-col items-center justify-center text-[#5D6D7E] opacity-50">
          <ShieldCheck size={48} strokeWidth={1.5} className="mb-2" />
          <span className="text-xs font-bold tracking-widest">SYSTEM ADMIN</span>
        </div>
      </aside>

      <main className="ml-[280px] flex-1 p-12 pb-32 max-w-3xl">
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold text-[#1C2833] mb-2 tracking-tight">系统核心设置</h1>
          <p className="text-[#5D6D7E] text-md">配置您的 LLM 服务商信息与 API 访问密钥。</p>
        </header>

        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-[24px] shadow-[0_8px_30px_rgba(102,204,255,0.1)] border border-white space-y-8">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 rounded-full bg-[#E0F6FF] text-[#66CCFF] flex items-center justify-center">
              <Cpu size={20} />
            </div>
            <h2 className="text-2xl font-bold text-[#1C2833]">模型访问配置</h2>
          </div>

          {loading ? (
            <div className="text-sm text-[#5D6D7E]">正在加载配置…</div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-[#1C2833] mb-2">提供商 (Provider)</label>
                  <select
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
                    className="w-full bg-[#F9FCFF] text-[#1C2833] rounded-[12px] px-4 py-3 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#66CCFF]/50 transition-all appearance-none cursor-pointer"
                  >
                    {modelsResponse?.providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#1C2833] mb-2">API 密钥 (API Key)</label>
                  <div className="relative">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) =>
                        setApiKeyDrafts((current) => ({
                          ...current,
                          [currentApiKeyEnv]: event.target.value
                        }))
                      }
                      placeholder="sk-..."
                      className="w-full bg-[#F9FCFF] text-[#1C2833] placeholder-gray-400 rounded-[12px] px-4 py-3 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#66CCFF]/50 transition-all pr-10"
                    />
                    <Key size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#1C2833] mb-2">模型选择 (Model)</label>
                <div className="flex gap-4 items-center">
                  <select
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
                    className="flex-1 bg-[#F9FCFF] text-[#1C2833] rounded-[12px] px-4 py-3 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#66CCFF]/50 transition-all appearance-none cursor-pointer"
                  >
                    {modelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void loadAll()}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white text-[#66CCFF] border border-[#66CCFF]/30 rounded-[12px] font-bold text-sm hover:bg-[#F0F8FF] transition-colors whitespace-nowrap"
                  >
                    <RefreshCw size={16} /> 刷新模型
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowEndpointModal(true)}
                  className="text-sm text-[#66CCFF] hover:text-[#4DB8FF] flex items-center gap-2 font-medium transition-colors"
                >
                  <Server size={14} />
                  {formState.base_url?.trim() ? `自定义端点: ${formState.base_url}` : '高级设置：配置自定义 API 端点 (Base URL)'}
                </button>
              </div>

              {error ? <div className="p-4 bg-red-50 border border-red-100 rounded-[12px] text-sm text-red-600">{error}</div> : null}
              {message ? <div className="p-4 bg-[#F0F8FF] border border-[#66CCFF]/20 rounded-[12px] text-sm text-[#66CCFF] font-bold">{message}</div> : null}
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="px-10 py-3 bg-[#66CCFF] text-white rounded-[12px] font-bold text-sm shadow-[0_8px_20px_rgba(102,204,255,0.3)] hover:bg-[#4DB8FF] transition-all hover:scale-105 disabled:opacity-60 flex items-center gap-2"
            >
              <Save size={16} /> {saving ? '保存中…' : '保存设置'}
            </button>
          </div>
        </div>
      </main>

      {showEndpointModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1C2833]/20 backdrop-blur-sm transition-opacity">
          <div className="bg-white p-6 rounded-[24px] shadow-2xl border border-white/50 w-full max-w-md">
            <h3 className="text-lg font-bold text-[#1C2833] mb-4 flex items-center gap-2">
              <Server size={18} className="text-[#66CCFF]" /> 自定义 API 端点
            </h3>
            <input
              type="text"
              value={formState.base_url ?? ''}
              onChange={(event) => {
                setInheritedRuntimeFields((current) => ({ ...current, base_url: false }));
                setFormState((current) => ({ ...current, base_url: event.target.value }));
              }}
              placeholder="例如: https://api.openai.com/v1"
              className="w-full bg-[#F4F7FA] text-[#1C2833] rounded-[12px] px-4 py-3 border border-transparent focus:outline-none focus:ring-2 focus:ring-[#66CCFF]/50 transition-all mb-8"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowEndpointModal(false)} className="px-5 py-2.5 text-[#5D6D7E] font-bold text-sm hover:text-[#1C2833]">取消</button>
              <button onClick={() => setShowEndpointModal(false)} className="px-8 py-2.5 bg-[#66CCFF] text-white rounded-[12px] font-bold text-sm shadow-md hover:bg-[#4DB8FF]">确认</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
