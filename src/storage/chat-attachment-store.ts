import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PDFParse } from 'pdf-parse';

import { buildProjectPaths } from '../config/project-paths.js';
import {
  createChatAttachmentRecord,
  inferChatAttachmentKind,
  toChatAttachmentRef,
  type ChatAttachmentRecord
} from '../domain/chat-attachment.js';

interface ChatAttachmentArtifactPaths {
  attachmentDirectory: string;
  metadata: string;
  original: string;
  markdown: string;
}

export async function saveBufferedChatAttachment(root: string, input: {
  sessionId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}): Promise<ChatAttachmentRecord> {
  const attachmentId = randomUUID();
  const paths = buildChatAttachmentArtifactPaths(root, attachmentId);
  const kind = inferChatAttachmentKind(input.fileName, input.mimeType);
  const markdown = await convertAttachmentToMarkdown({
    fileName: input.fileName,
    mimeType: input.mimeType,
    data: input.data,
    kind
  });
  const originalRelPath = path.relative(root, paths.original).replaceAll(path.sep, '/');
  const markdownRelPath = path.relative(root, paths.markdown).replaceAll(path.sep, '/');
  const record = createChatAttachmentRecord({
    attachment_id: attachmentId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    kind,
    session_id: input.sessionId,
    size_bytes: input.data.byteLength,
    original_rel_path: originalRelPath,
    markdown_rel_path: markdownRelPath,
    markdown_char_count: markdown.length
  });

  await mkdir(paths.attachmentDirectory, { recursive: true });
  await writeFile(paths.original, input.data);
  await writeFile(paths.markdown, normalizeMarkdown(markdown), 'utf8');
  await writeFile(paths.metadata, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  return record;
}

export async function loadChatAttachment(root: string, attachmentId: string): Promise<ChatAttachmentRecord> {
  const paths = buildChatAttachmentArtifactPaths(root, attachmentId);
  const raw = JSON.parse(await readFile(paths.metadata, 'utf8')) as unknown;

  return assertChatAttachmentRecord(raw, `${attachmentId}.json`);
}

export async function resolveChatAttachments(
  root: string,
  attachmentIds: string[],
  sessionId?: string
): Promise<ChatAttachmentRecord[]> {
  const attachments = await Promise.all(attachmentIds.map((attachmentId) => loadChatAttachment(root, attachmentId)));

  if (sessionId) {
    for (const attachment of attachments) {
      if (attachment.session_id !== sessionId) {
        throw new Error(`Attachment does not belong to session: ${attachment.attachment_id}`);
      }
    }
  }

  return attachments;
}

export async function findChatAttachmentByKnowledgeInsertPipelineRunId(
  root: string,
  pipelineRunId: string
): Promise<ChatAttachmentRecord | null> {
  const attachmentsRoot = buildProjectPaths(root).stateChatAttachments;
  let entries: string[];

  try {
    entries = await readdir(attachmentsRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  for (const entry of entries) {
    try {
      const attachment = await loadChatAttachment(root, entry);
      if (attachment.knowledge_insert_pipeline_run_id === pipelineRunId) {
        return attachment;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return null;
}

export async function markChatAttachmentPersisted(root: string, attachmentId: string): Promise<ChatAttachmentRecord> {
  const attachment = await loadChatAttachment(root, attachmentId);
  const updated = createChatAttachmentRecord({
    attachment_id: attachment.attachment_id,
    file_name: attachment.file_name,
    mime_type: attachment.mime_type,
    kind: attachment.kind,
    session_id: attachment.session_id,
    created_at: attachment.created_at,
    status: 'persisted',
    size_bytes: attachment.size_bytes,
    original_rel_path: attachment.original_rel_path,
    markdown_rel_path: attachment.markdown_rel_path,
    markdown_char_count: attachment.markdown_char_count,
    expires_at: attachment.expires_at,
    knowledge_insert_pipeline_run_id: attachment.knowledge_insert_pipeline_run_id
  });
  const paths = buildChatAttachmentArtifactPaths(root, attachmentId);

  await writeFile(paths.metadata, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

export async function markChatAttachmentKnowledgeInsertPipeline(
  root: string,
  attachmentId: string,
  pipelineRunId: string
): Promise<ChatAttachmentRecord> {
  const attachment = await loadChatAttachment(root, attachmentId);
  const updated = createChatAttachmentRecord({
    attachment_id: attachment.attachment_id,
    file_name: attachment.file_name,
    mime_type: attachment.mime_type,
    kind: attachment.kind,
    session_id: attachment.session_id,
    created_at: attachment.created_at,
    status: attachment.status,
    size_bytes: attachment.size_bytes,
    original_rel_path: attachment.original_rel_path,
    markdown_rel_path: attachment.markdown_rel_path,
    markdown_char_count: attachment.markdown_char_count,
    expires_at: attachment.expires_at,
    knowledge_insert_pipeline_run_id: pipelineRunId
  });
  const paths = buildChatAttachmentArtifactPaths(root, attachmentId);

  await writeFile(paths.metadata, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}

export async function loadChatAttachmentMarkdown(root: string, attachmentId: string): Promise<string> {
  const attachment = await loadChatAttachment(root, attachmentId);
  return await readFile(path.join(root, attachment.markdown_rel_path), 'utf8');
}

export async function loadChatAttachmentOriginal(root: string, attachmentId: string): Promise<Buffer> {
  const attachment = await loadChatAttachment(root, attachmentId);
  return await readFile(path.join(root, attachment.original_rel_path));
}

export { toChatAttachmentRef };

function buildChatAttachmentArtifactPaths(root: string, attachmentId: string): ChatAttachmentArtifactPaths {
  assertValidAttachmentId(attachmentId);
  const attachmentDirectory = path.join(buildProjectPaths(root).stateChatAttachments, attachmentId);

  return {
    attachmentDirectory,
    metadata: path.join(attachmentDirectory, 'attachment.json'),
    original: path.join(attachmentDirectory, 'original.bin'),
    markdown: path.join(attachmentDirectory, 'content.md')
  };
}

async function convertAttachmentToMarkdown(input: {
  fileName: string;
  mimeType: string;
  data: Buffer;
  kind: ChatAttachmentRecord['kind'];
}): Promise<string> {
  switch (input.kind) {
    case 'image':
      return `# Uploaded Image\n\nFile: ${input.fileName}\n\nMIME type: ${input.mimeType}\n\nThis image is available to the model as visual context.\n`;
    case 'pdf':
      return await convertPdfToMarkdown(input.fileName, input.data);
    case 'text':
    default:
      return convertTextToMarkdown(input.fileName, input.data);
  }
}

async function convertPdfToMarkdown(fileName: string, data: Buffer): Promise<string> {
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return `# Uploaded PDF\n\nFile: ${fileName}\n\n${result.text.trim()}\n`;
  } finally {
    await parser.destroy();
  }
}

function convertTextToMarkdown(fileName: string, data: Buffer): string {
  return `# Uploaded File\n\nFile: ${fileName}\n\n${data.toString('utf8').trim()}\n`;
}

function normalizeMarkdown(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function assertValidAttachmentId(attachmentId: string): void {
  if (
    attachmentId.length === 0 ||
    attachmentId === '.' ||
    attachmentId === '..' ||
    attachmentId !== path.basename(attachmentId) ||
    attachmentId.includes('/') ||
    attachmentId.includes('\\')
  ) {
    throw new Error(`Invalid attachment id: ${attachmentId}`);
  }
}

function assertChatAttachmentRecord(value: unknown, fileName: string): ChatAttachmentRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid chat attachment state: invalid ${fileName}`);
  }

  if (
    typeof value.attachment_id !== 'string'
    || typeof value.file_name !== 'string'
    || typeof value.mime_type !== 'string'
    || (value.kind !== 'image' && value.kind !== 'pdf' && value.kind !== 'text')
    || typeof value.session_id !== 'string'
    || typeof value.created_at !== 'string'
    || (value.status !== 'buffered' && value.status !== 'persisted')
    || typeof value.size_bytes !== 'number'
    || typeof value.original_rel_path !== 'string'
    || typeof value.markdown_rel_path !== 'string'
    || typeof value.markdown_char_count !== 'number'
    || typeof value.expires_at !== 'string'
    || (value.knowledge_insert_pipeline_run_id !== undefined && typeof value.knowledge_insert_pipeline_run_id !== 'string')
  ) {
    throw new Error(`Invalid chat attachment state: invalid ${fileName}`);
  }

  return createChatAttachmentRecord({
    attachment_id: value.attachment_id,
    file_name: value.file_name,
    mime_type: value.mime_type,
    kind: value.kind,
    session_id: value.session_id,
    created_at: value.created_at,
    status: value.status,
    size_bytes: value.size_bytes,
    original_rel_path: value.original_rel_path,
    markdown_rel_path: value.markdown_rel_path,
    markdown_char_count: value.markdown_char_count,
    expires_at: value.expires_at,
    knowledge_insert_pipeline_run_id: value.knowledge_insert_pipeline_run_id
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
