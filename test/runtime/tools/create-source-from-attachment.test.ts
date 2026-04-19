import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapProject } from '../../../src/app/bootstrap-project.js';
import { createRuntimeContext } from '../../../src/runtime/runtime-context.js';
import { createCreateSourceFromAttachmentTool } from '../../../src/runtime/tools/create-source-from-attachment.js';
import { loadChatAttachment, saveBufferedChatAttachment } from '../../../src/storage/chat-attachment-store.js';
import { loadSourceManifest } from '../../../src/storage/source-manifest-store.js';

describe('createCreateSourceFromAttachmentTool', () => {
  it('promotes a buffered attachment into a source manifest and raw accepted markdown source', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-runtime-create-source-tool-'));

    try {
      await bootstrapProject(root);
      const attachment = await saveBufferedChatAttachment(root, {
        sessionId: 'session-001',
        fileName: 'brief.txt',
        mimeType: 'text/plain',
        data: Buffer.from('Attachment body for source creation\n', 'utf8')
      });
      const tool = createCreateSourceFromAttachmentTool(
        createRuntimeContext({
          root,
          runId: 'runtime-parent-attach-001',
          sessionId: 'session-001'
        })
      );

      const result = await tool.execute('tool-call-1', {
        attachmentId: attachment.attachment_id
      });

      expect(result.details.summary).toContain('created source manifest');
      expect(result.details.resultMarkdown).toContain('brief.txt');
      const sourceId = result.details.data?.sourceId;
      const rawPath = result.details.data?.rawPath;
      expect(typeof sourceId).toBe('string');
      expect(typeof rawPath).toBe('string');

      const manifest = await loadSourceManifest(root, String(sourceId));
      expect(manifest.status).toBe('accepted');
      expect(manifest.path).toBe(rawPath);
      expect(manifest.notes).toContain(attachment.attachment_id);
      expect(await readFile(path.join(root, String(rawPath)), 'utf8')).toContain('Attachment body for source creation');

      const updatedAttachment = await loadChatAttachment(root, attachment.attachment_id);
      expect(updatedAttachment.status).toBe('persisted');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
