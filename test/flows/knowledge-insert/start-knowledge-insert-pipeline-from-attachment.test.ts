import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createKnowledgeInsertPipelineState } from '../../../src/domain/knowledge-insert-pipeline.js';
import { writeKnowledgeInsertPipelineArtifact } from '../../../src/flows/knowledge-insert/pipeline-artifacts.js';
import { startKnowledgeInsertPipelineFromAttachment } from '../../../src/flows/knowledge-insert/start-knowledge-insert-pipeline-from-attachment.js';
import {
  markChatAttachmentKnowledgeInsertPipeline,
  saveBufferedChatAttachment
} from '../../../src/storage/chat-attachment-store.js';

describe('startKnowledgeInsertPipelineFromAttachment', () => {
  it('returns an existing attachment pipeline run instead of starting a duplicate', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'llm-wiki-start-knowledge-insert-pipeline-'));

    try {
      const attachment = await saveBufferedChatAttachment(root, {
        sessionId: 'session-001',
        fileName: 'brief.txt',
        mimeType: 'text/plain',
        data: Buffer.from('Attachment body\n', 'utf8')
      });
      await markChatAttachmentKnowledgeInsertPipeline(root, attachment.attachment_id, 'pipeline-existing');
      await writeKnowledgeInsertPipelineArtifact(root, 'pipeline-existing', 'pipeline-state.json', createKnowledgeInsertPipelineState({
        runId: 'pipeline-existing',
        sourceId: `src-attachment-${attachment.attachment_id}`,
        storageMode: 'pg-primary',
        currentStage: 'parts.materialized',
        status: 'running',
        artifacts: {},
        errors: []
      }));

      const result = await startKnowledgeInsertPipelineFromAttachment({
        root,
        attachmentId: attachment.attachment_id,
        sessionId: 'session-001'
      });

      expect(result).toMatchObject({
        runId: 'pipeline-existing',
        sourceId: `src-attachment-${attachment.attachment_id}`,
        status: 'running',
        artifactsRoot: 'state/artifacts/knowledge-insert-pipeline/pipeline-existing'
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
