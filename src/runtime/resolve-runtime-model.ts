import { getEnvApiKey, getModel, getModels, getProviders, type Api, type KnownProvider, type Model } from '@mariozechner/pi-ai';

import { createChatSettings, type ChatModelApi, type ChatSettings } from '../domain/chat-settings.js';
import { loadProjectEnvSync } from '../storage/project-env-store.js';

export interface ResolveRuntimeModelResult {
  model: Model<Api>;
  getApiKey: (provider: string) => string | undefined;
}

export interface ResolveRuntimeModelOptions {
  root?: string;
}

export interface RuntimeModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  api: ChatModelApi;
  base_url: string;
  api_key_env?: string;
  reasoning: boolean;
  context_window: number;
  max_tokens: number;
  built_in: boolean;
  selected: boolean;
}

export interface RuntimeModelCatalogProvider {
  id: string;
  models: RuntimeModelCatalogEntry[];
}

export interface RuntimeModelCatalogSelected {
  provider: string;
  model: string;
  api?: ChatModelApi;
  base_url?: string;
  api_key_env?: string;
  reasoning?: boolean;
  context_window?: number;
  max_tokens?: number;
}

export interface RuntimeModelCatalog {
  defaultProvider: string;
  providers: RuntimeModelCatalogProvider[];
  selected: RuntimeModelCatalogSelected;
}

export function resolveRuntimeModel(
  settingsInput?: ChatSettings,
  options: ResolveRuntimeModelOptions = {}
): ResolveRuntimeModelResult {
  const settings = createChatSettings(settingsInput);
  const envFileValues = options.root ? loadProjectEnvSync(options.root).values : undefined;
  const parsedReference = parseModelReference(settings.model, settings.provider);
  const builtInModel = loadBuiltInModel(parsedReference.provider, parsedReference.modelId);
  const model =
    settings.base_url !== undefined || settings.api !== undefined || settings.provider !== undefined || builtInModel === null
      ? buildCustomModel(settings, parsedReference, builtInModel)
      : builtInModel;

  return {
    model,
    getApiKey: (provider: string) => resolveApiKey(settings, provider, envFileValues)
  };
}

export function listRuntimeModelCatalog(settingsInput?: ChatSettings): RuntimeModelCatalog {
  const settings = createChatSettings(settingsInput);
  const parsedReference = parseModelReference(settings.model, settings.provider);
  const selectedRuntimeModel = resolveRuntimeModel(settings).model;
  const providerIds = new Set<string>(getProviders());

  providerIds.add(settings.provider ?? parsedReference.provider);
  providerIds.add('llm-wiki-liiy');

  const providers = Array.from(providerIds)
    .sort((left, right) => compareProviders(left, right, settings.provider ?? parsedReference.provider))
    .map((providerId) => {
      const builtInEntries = loadProviderCatalogEntries(
        providerId,
        settings,
        parsedReference,
        providerId === (settings.provider ?? parsedReference.provider)
      );
      const selectedModelAlreadyListed = builtInEntries.some(
        (entry) => entry.id === parsedReference.modelId && entry.provider === (settings.provider ?? parsedReference.provider)
      );
      const models =
        providerId === (settings.provider ?? parsedReference.provider) && !selectedModelAlreadyListed
          ? [...builtInEntries, createSelectedCatalogEntry(settings, selectedRuntimeModel, parsedReference.modelId)]
          : builtInEntries;

      return {
        id: providerId,
        models: sortCatalogEntries(models)
      };
    });

  return {
    defaultProvider: 'llm-wiki-liiy',
    providers,
    selected: {
      provider: settings.provider ?? parsedReference.provider,
      model: parsedReference.modelId,
      ...(settings.api === undefined ? {} : { api: settings.api }),
      ...(settings.base_url === undefined ? {} : { base_url: settings.base_url }),
      ...(settings.api_key_env === undefined ? {} : { api_key_env: settings.api_key_env }),
      ...(settings.reasoning === undefined ? {} : { reasoning: settings.reasoning }),
      ...(settings.context_window === undefined ? {} : { context_window: settings.context_window }),
      ...(settings.max_tokens === undefined ? {} : { max_tokens: settings.max_tokens })
    }
  };
}

function buildCustomModel(
  settings: ChatSettings,
  parsedReference: ParsedModelReference,
  builtInModel: Model<Api> | null
): Model<Api> {
  const inferredApi = builtInModel ? narrowApi(builtInModel.api) : undefined;
  const api = settings.api ?? inferredApi ?? inferApiFromProvider(parsedReference.provider);
  const provider = settings.provider ?? builtInModel?.provider ?? parsedReference.provider;
  const modelId = parsedReference.modelId;
  const name = builtInModel?.name ?? modelId;
  const baseUrl = normalizeBaseUrlForApi(settings.base_url ?? builtInModel?.baseUrl ?? inferBaseUrl(api), api);
  const reasoning = settings.reasoning ?? builtInModel?.reasoning ?? inferReasoning(api, modelId);
  const contextWindow = settings.context_window ?? builtInModel?.contextWindow ?? inferContextWindow(api);
  const maxTokens = settings.max_tokens ?? builtInModel?.maxTokens ?? inferMaxTokens(api);
  const input = builtInModel?.input ?? ['text'];
  const cost = builtInModel?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const headers = builtInModel?.headers;
  const compat = builtInModel?.compat;

  return {
    id: modelId,
    name,
    api,
    provider,
    baseUrl,
    reasoning,
    input,
    cost,
    contextWindow,
    maxTokens,
    ...(headers === undefined ? {} : { headers }),
    ...(compat === undefined ? {} : { compat })
  };
}

function loadProviderCatalogEntries(
  providerId: string,
  settings: ChatSettings,
  parsedReference: ParsedModelReference,
  isSelectedProvider: boolean
): RuntimeModelCatalogEntry[] {
  const entries = isLibraryKnownProvider(providerId)
    ? getModels(providerId).map((model) => toCatalogEntry(model, settings, parsedReference.modelId, isSelectedProvider))
    : [];

  if (providerId === 'llm-wiki-liiy' && !entries.some((entry) => entry.id === 'gpt-5.4')) {
    entries.push(
      toCatalogEntry(
        buildCustomModel(
          createChatSettings({
            model: 'gpt-5.4',
            provider: 'llm-wiki-liiy',
            api: 'anthropic-messages',
            base_url: 'http://runtime.example.invalid/v1',
            api_key_env: 'RUNTIME_API_KEY',
            reasoning: true
          }),
          parseModelReference('gpt-5.4', 'llm-wiki-liiy'),
          null
        ),
        settings,
        parsedReference.modelId,
        isSelectedProvider,
        true
      )
    );
  }

  return entries;
}

function createSelectedCatalogEntry(
  settings: ChatSettings,
  model: Model<Api>,
  selectedModelId: string
): RuntimeModelCatalogEntry {
  return {
    id: selectedModelId,
    name: model.name,
    provider: model.provider,
    api: narrowApi(model.api),
    base_url: model.baseUrl,
    ...(settings.api_key_env === undefined ? {} : { api_key_env: settings.api_key_env }),
    reasoning: model.reasoning,
    context_window: model.contextWindow,
    max_tokens: model.maxTokens,
    built_in: false,
    selected: true
  };
}

function toCatalogEntry(
  model: Model<Api>,
  settings: ChatSettings,
  selectedModelId: string,
  isSelectedProvider: boolean,
  builtIn = true
): RuntimeModelCatalogEntry {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    api: narrowApi(model.api),
    base_url: model.baseUrl,
    ...(isSelectedProvider && settings.api_key_env !== undefined ? { api_key_env: settings.api_key_env } : {}),
    reasoning: model.reasoning,
    context_window: model.contextWindow,
    max_tokens: model.maxTokens,
    built_in: builtIn,
    selected: isSelectedProvider && model.id === selectedModelId
  };
}

function compareProviders(left: string, right: string, selectedProvider: string): number {
  if (left === 'llm-wiki-liiy') {
    return -1;
  }

  if (right === 'llm-wiki-liiy') {
    return 1;
  }

  if (left === selectedProvider) {
    return -1;
  }

  if (right === selectedProvider) {
    return 1;
  }

  return left.localeCompare(right);
}

function sortCatalogEntries(entries: RuntimeModelCatalogEntry[]): RuntimeModelCatalogEntry[] {
  return [...entries].sort((left, right) => {
    if (left.selected) {
      return -1;
    }

    if (right.selected) {
      return 1;
    }

    return left.id.localeCompare(right.id);
  });
}

function resolveApiKey(
  settings: ChatSettings,
  provider: string,
  envFileValues?: Record<string, string>
): string | undefined {
  const configuredEnvName = settings.api_key_env?.trim();
  const configuredValue = configuredEnvName
    ? readConfiguredEnvValue(configuredEnvName, envFileValues)
    : undefined;

  if (configuredValue) {
    return configuredValue;
  }

  if (configuredEnvName && envFileValues !== undefined) {
    return undefined;
  }

  return envFileValues !== undefined ? undefined : getEnvApiKey(provider);
}

function readConfiguredEnvValue(
  envName: string,
  envFileValues?: Record<string, string>
): string | undefined {
  const configuredValue = envFileValues !== undefined ? envFileValues[envName] : process.env[envName];

  if (configuredValue && configuredValue.trim().length > 0) {
    return configuredValue;
  }

  return undefined;
}

interface ParsedModelReference {
  provider: string;
  modelId: string;
}

function parseModelReference(model: string, providerOverride?: string): ParsedModelReference {
  const trimmedModel = model.trim();
  const separatorIndex = trimmedModel.indexOf(':');

  if (providerOverride && trimmedModel.length > 0) {
    return {
      provider: providerOverride,
      modelId: separatorIndex >= 0 ? trimmedModel.slice(separatorIndex + 1) : trimmedModel
    };
  }

  if (separatorIndex > 0 && separatorIndex < trimmedModel.length - 1) {
    return {
      provider: trimmedModel.slice(0, separatorIndex),
      modelId: trimmedModel.slice(separatorIndex + 1)
    };
  }

  return {
    provider: providerOverride ?? 'anthropic',
    modelId: trimmedModel
  };
}

function loadBuiltInModel(provider: string, modelId: string): Model<Api> | null {
  if (!isLibraryKnownProvider(provider)) {
    return null;
  }

  try {
    return getModel(provider, modelId as never) ?? null;
  } catch {
    return null;
  }
}

function isLibraryKnownProvider(provider: string): provider is KnownProvider {
  return getProviders().includes(provider as KnownProvider);
}

function narrowApi(api: Api): ChatModelApi {
  if (api === 'anthropic-messages') {
    return 'anthropic-messages';
  }

  if (api === 'openai-responses') {
    return 'openai-responses';
  }

  if (api === 'openai-completions') {
    return 'openai-completions';
  }

  if (api === 'azure-openai-responses' || api === 'openai-codex-responses') {
    return 'openai-responses';
  }

  return 'openai-completions';
}

function inferApiFromProvider(provider: string): ChatModelApi {
  if (provider === 'anthropic' || provider.includes('claude') || provider === 'llm-wiki-liiy') {
    return 'anthropic-messages';
  }

  if (provider === 'openai' || provider === 'azure-openai-responses' || provider === 'openai-codex') {
    return 'openai-responses';
  }

  return 'openai-completions';
}

function inferBaseUrl(api: ChatModelApi): string {
  return api === 'anthropic-messages'
    ? 'https://api.anthropic.com/v1'
    : api === 'openai-responses'
      ? 'https://api.openai.com/v1'
      : 'https://api.openai.com/v1';
}

function normalizeBaseUrlForApi(baseUrl: string, api: ChatModelApi): string {
  const normalized = ensureBaseUrlHasScheme(baseUrl);

  if (api !== 'anthropic-messages') {
    return normalized;
  }

  return normalized.replace(/\/v1\/?$/u, '');
}

function ensureBaseUrlHasScheme(baseUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(baseUrl)) {
    return baseUrl;
  }

  return `http://${baseUrl.replace(/^\/+/, '')}`;
}

function inferReasoning(api: ChatModelApi, modelId: string): boolean {
  if (api === 'anthropic-messages') {
    return true;
  }

  return /gpt-5|o1|o3|reason/i.test(modelId);
}

function inferContextWindow(api: ChatModelApi): number {
  return api === 'anthropic-messages' ? 200000 : 128000;
}

function inferMaxTokens(api: ChatModelApi): number {
  return api === 'anthropic-messages' ? 8192 : 16384;
}
