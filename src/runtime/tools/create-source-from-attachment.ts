import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { createSourceManifest } from '../../domain/source-manifest.js';
import {
  loadChatAttachment,
  loadChatAttachmentMarkdown,
  loadChatAttachmentOriginal,
  markChatAttachmentPersisted
} from '../../storage/chat-attachment-store.js';
import { buildSourceManifestPath } from '../../storage/source-manifest-paths.js';
import { loadSourceManifest, saveSourceManifest } from '../../storage/source-manifest-store.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';

const parameters = Type.Object({
  attachmentId: Type.String({ description: 'Attachment handle from the current chat context' }),
  sourceTitle: Type.Optional(Type.String({ description: 'Optional source title override' })),
  status: Type.Optional(Type.Union([Type.Literal('accepted'), Type.Literal('inbox')]))
});

export type CreateSourceFromAttachmentParameters = Static<typeof parameters>;

export function createCreateSourceFromAttachmentTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'create_source_from_attachment',
    label: 'Create Source From Attachment',
    description:
      'Promote a buffered chat attachment into the source system by persisting it as a registered source manifest and raw markdown source. Use this only when the user clearly wants the uploaded material persisted into the source layer.',
    parameters,
    execute: async (_toolCallId, params) => {
      const attachment = await loadChatAttachment(runtimeContext.root, params.attachmentId);

      if (runtimeContext.sessionId && attachment.session_id !== runtimeContext.sessionId) {
        throw new Error(`Attachment does not belong to the active session: ${attachment.attachment_id}`);
      }

      const sourceId = buildSourceId(attachment.attachment_id);
      const existingManifest = await loadSourceManifestIfExists(runtimeContext.root, sourceId);

      if (existingManifest) {
        await markChatAttachmentPersisted(runtimeContext.root, attachment.attachment_id);
        const outcome: RuntimeToolOutcome = {
          toolName: 'create_source_from_attachment',
          summary: `reused source manifest ${existingManifest.id}`,
          evidence: [existingManifest.path],
          touchedFiles: [],
          resultMarkdown: [
            `Reused existing source manifest: ${existingManifest.id}`,
            `Path: ${existingManifest.path}`,
            `Title: ${existingManifest.title}`,
            `Status: ${existingManifest.status}`
          ].join('\n'),
          data: {
            sourceId: existingManifest.id,
            rawPath: existingManifest.path
          }
        };

        return {
          content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
          details: outcome
        };
      }

      const title = params.sourceTitle?.trim() || deriveTitleFromFileName(attachment.file_name);
      const markdownBody = await loadChatAttachmentMarkdown(runtimeContext.root, attachment.attachment_id);
      const originalBytes = await loadChatAttachmentOriginal(runtimeContext.root, attachment.attachment_id);
      const paths = buildPersistedAttachmentSourcePaths(runtimeContext.root, sourceId, attachment.file_name);
      const importedAt = new Date().toISOString();
      const manifest = createSourceManifest({
        id: sourceId,
        path: paths.rawMarkdownRelPath,
        title,
        type: 'markdown',
        status: params.status ?? 'accepted',
        hash: `sha256:${createHash('sha256').update(markdownBody).digest('hex')}`,
        imported_at: importedAt,
        tags: deriveTags(title, attachment.kind),
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
      await saveSourceManifest(runtimeContext.root, manifest);
      await markChatAttachmentPersisted(runtimeContext.root, attachment.attachment_id);

      const touchedFiles = [
        paths.rawMarkdownRelPath,
        paths.rawOriginalRelPath,
        relativeSourceManifestPath(runtimeContext.root, sourceId)
      ];
      const resultMarkdown = [
        `Created source manifest: ${manifest.id}`,
        `Attachment file: ${attachment.file_name}`,
        `Title: ${manifest.title}`,
        `Status: ${manifest.status}`,
        `Markdown source: ${manifest.path}`,
        `Original persisted path: ${paths.rawOriginalRelPath}`
      ].join('\n');
      const outcome: RuntimeToolOutcome = {
        toolName: 'create_source_from_attachment',
        summary: `created source manifest ${manifest.id}`,
        evidence: [manifest.path],
        touchedFiles,
        resultMarkdown,
        data: {
          sourceId: manifest.id,
          rawPath: manifest.path,
          attachmentId: attachment.attachment_id
        }
      };

      return {
        content: [{ type: 'text', text: resultMarkdown }],
        details: outcome
      };
    }
  };
}

function buildSourceId(attachmentId: string): string {
  return `src-attachment-${attachmentId}`;
}

function deriveTitleFromFileName(fileName: string): string {
  const stem = path.basename(fileName, path.extname(fileName));
  const tokens = stem
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1));

  return tokens.join(' ') || 'Uploaded Attachment';
}

function deriveTags(title: string, kind: string): string[] {
  const titleTokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 6);

  return [...new Set(['attachment', kind, ...titleTokens])];
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
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

function relativeSourceManifestPath(root: string, sourceId: string): string {
  return path.relative(root, buildSourceManifestPath(root, sourceId)).replaceAll(path.sep, '/');
}

async function loadSourceManifestIfExists(root: string, sourceId: string) {
  try {
    return await loadSourceManifest(root, sourceId);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === `Incomplete source manifest state: missing ${sourceId}.json`) {
      return null;
    }

    throw error;
  }
}
