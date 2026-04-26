import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { complete, type Api, type Context, type Model } from '@mariozechner/pi-ai';

import { createSourceManifest } from '../../domain/source-manifest.js';
import { resolveRuntimeModel } from '../../runtime/resolve-runtime-model.js';
import {
  loadChatAttachment,
  loadChatAttachmentMarkdown,
  loadChatAttachmentOriginal,
  markChatAttachmentPersisted
} from '../../storage/chat-attachment-store.js';
import { buildGraphSchemaSql } from '../../storage/graph-schema.js';
import { getSharedGraphDatabasePool, resolveGraphDatabaseUrl } from '../../storage/graph-database.js';
import { loadSourceManifest, saveSourceManifest } from '../../storage/source-manifest-store.js';
import { loadChatSettings } from '../../storage/chat-settings-store.js';
import { loadProjectEnv } from '../../storage/project-env-store.js';
import { createKnowledgeInsertPipelineState } from '../../domain/knowledge-insert-pipeline.js';

import { runKnowledgeInsertPipeline, type PipelineStageGenerator } from './run-knowledge-insert-pipeline.js';
import { readKnowledgeInsertPipelineArtifact, writeKnowledgeInsertPipelineArtifact } from './pipeline-artifacts.js';

const MAX_STAGE_GENERATION_ATTEMPTS = 3;

export interface StartKnowledgeInsertPipelineFromAttachmentInput {
  root: string;
  attachmentId: string;
  sessionId?: string;
  runId?: string;
  maxPartExtractionConcurrency?: number;
  resetKnowledgeGraphBeforeRun?: boolean;
}

export interface StartKnowledgeInsertPipelineFromAttachmentResult {
  runId: string;
  sourceId: string;
  status: string;
  artifactsRoot: string;
}

export async function startKnowledgeInsertPipelineFromAttachment(
  input: StartKnowledgeInsertPipelineFromAttachmentInput
): Promise<StartKnowledgeInsertPipelineFromAttachmentResult> {
  const runId = input.runId ?? `pipeline-${randomUUID()}`;
  let sourceId: string | undefined;

  try {
    sourceId = await promoteAttachmentToAcceptedSource(input.root, input.attachmentId, input.sessionId);
    const settings = await loadChatSettings(input.root);
    const resolvedRuntimeModel = resolveRuntimeModel(settings, { root: input.root });
    const graphClient = await createReadyGraphClient(input.root);
    if (input.resetKnowledgeGraphBeforeRun) {
      await resetKnowledgeGraph(graphClient);
    }
    const generator = createModelBackedPipelineStageGenerator({
      model: resolvedRuntimeModel.model,
      getApiKey: resolvedRuntimeModel.getApiKey,
      sessionId: runId
    });
    const result = await runKnowledgeInsertPipeline(input.root, {
      runId,
      sourceId,
      graphClient,
      stageGenerators: {
        'topics.planned': generator,
        'parts.planned': generator,
        'parts.extracted': generator
      },
      maxPartExtractionConcurrency: input.maxPartExtractionConcurrency
    });

    return {
      runId,
      sourceId,
      status: result.state.status,
      artifactsRoot: `state/artifacts/knowledge-insert-pipeline/${runId}`
    };
  } catch (error) {
    if (sourceId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      try {
        const existingState = await readKnowledgeInsertPipelineArtifact<ReturnType<typeof createKnowledgeInsertPipelineState>>(
          input.root,
          runId,
          'pipeline-state.json'
        );
        await writeKnowledgeInsertPipelineArtifact(input.root, runId, 'pipeline-state.json', {
          ...existingState,
          status: 'failed',
          errors: [...existingState.errors, errorMessage]
        });
      } catch {
        await writeKnowledgeInsertPipelineArtifact(input.root, runId, 'pipeline-state.json', createKnowledgeInsertPipelineState({
          runId,
          sourceId,
          storageMode: 'pg-primary',
          currentStage: 'source.uploaded',
          status: 'failed',
          artifacts: {},
          errors: [errorMessage]
        }));
      }
    }
    throw error;
  }
}

async function resetKnowledgeGraph(graphClient: Awaited<ReturnType<typeof createReadyGraphClient>>): Promise<void> {
  await graphClient.query('truncate table graph_edges, graph_nodes restart identity');
}

function createModelBackedPipelineStageGenerator(input: {
  model: Model<Api>;
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
  sessionId: string;
}): PipelineStageGenerator {
  return async (prompt) => {
    const apiKey = await input.getApiKey(input.model.provider);
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_STAGE_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const response = await complete(input.model, buildStageContext(prompt), {
          ...(apiKey ? { apiKey } : {}),
          sessionId: `${input.sessionId}-${attempt}`
        });

        if (response.stopReason === 'error' || response.stopReason === 'aborted') {
          throw new Error(response.errorMessage ?? `Pipeline stage generation failed with ${response.stopReason}`);
        }

        return response.content
          .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
          .map((block) => block.text)
          .join('')
          .trim();
      } catch (error) {
        lastError = error;
        if (attempt < MAX_STAGE_GENERATION_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    throw lastError;
  };
}

function buildStageContext(prompt: string): Context {
  return {
    systemPrompt: [
      'You are a restricted JSON worker for Knowledge Insert Pipeline V3.',
      'Return exactly one valid JSON object and no prose.',
      'Follow the required schemaVersion and Example JSON shape.',
      'Never call tools and never claim to write files, PG, or wiki.'
    ].join(' '),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
        timestamp: Date.now()
      }
    ]
  };
}

async function createReadyGraphClient(root: string) {
  const projectEnv = await loadProjectEnv(root);
  const graphClient = getSharedGraphDatabasePool(resolveGraphDatabaseUrl(projectEnv.contents));
  await graphClient.query(buildGraphSchemaSql());
  return graphClient;
}

async function promoteAttachmentToAcceptedSource(root: string, attachmentId: string, sessionId?: string): Promise<string> {
  const attachment = await loadChatAttachment(root, attachmentId);

  if (sessionId && attachment.session_id !== sessionId) {
    throw new Error(`Attachment does not belong to session: ${attachmentId}`);
  }

  const sourceId = `src-attachment-${attachment.attachment_id}`;
  const existingManifest = await loadSourceManifestIfExists(root, sourceId);

  if (existingManifest) {
    await markChatAttachmentPersisted(root, attachmentId);
    return existingManifest.id;
  }

  const markdownBody = await loadChatAttachmentMarkdown(root, attachmentId);
  const originalBytes = await loadChatAttachmentOriginal(root, attachmentId);
  const paths = buildPersistedAttachmentSourcePaths(root, sourceId, attachment.file_name);
  const manifest = createSourceManifest({
    id: sourceId,
    path: paths.rawMarkdownRelPath,
    title: deriveTitleFromFileName(attachment.file_name),
    type: 'markdown',
    status: 'accepted',
    hash: `sha256:${createHash('sha256').update(markdownBody).digest('hex')}`,
    imported_at: new Date().toISOString(),
    tags: ['attachment', attachment.kind],
    notes: [
      `Created from chat attachment ${attachment.attachment_id}`,
      `Original file: ${attachment.file_name}`,
      `Original mime type: ${attachment.mime_type}`,
      `Original persisted path: ${paths.rawOriginalRelPath}`
    ].join('\n')
  });

  await mkdir(path.dirname(paths.rawMarkdownAbsPath), { recursive: true });
  await writeFile(paths.rawMarkdownAbsPath, ensureTrailingNewline(markdownBody), 'utf8');
  await writeFile(paths.rawOriginalAbsPath, originalBytes);
  await saveSourceManifest(root, manifest);
  await markChatAttachmentPersisted(root, attachmentId);
  return manifest.id;
}

function buildPersistedAttachmentSourcePaths(root: string, sourceId: string, fileName: string): {
  rawMarkdownRelPath: string;
  rawMarkdownAbsPath: string;
  rawOriginalRelPath: string;
  rawOriginalAbsPath: string;
} {
  const directoryRelPath = path.join('raw', 'accepted', 'attachments');
  const extension = path.extname(fileName) || '.bin';
  const rawMarkdownRelPath = path.join(directoryRelPath, `${sourceId}.md`).replaceAll(path.sep, '/');
  const rawOriginalRelPath = path.join(directoryRelPath, `${sourceId}--original${extension}`).replaceAll(path.sep, '/');

  return {
    rawMarkdownRelPath,
    rawMarkdownAbsPath: path.join(root, rawMarkdownRelPath),
    rawOriginalRelPath,
    rawOriginalAbsPath: path.join(root, rawOriginalRelPath)
  };
}

function deriveTitleFromFileName(fileName: string): string {
  const stem = path.basename(fileName, path.extname(fileName)).trim();
  return stem || 'Uploaded Attachment';
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

async function loadSourceManifestIfExists(root: string, sourceId: string) {
  try {
    return await loadSourceManifest(root, sourceId);
  } catch (error: unknown) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' ||
      (error instanceof Error && error.message === `Incomplete source manifest state: missing ${sourceId}.json`)
    ) {
      return null;
    }

    throw error;
  }
}
