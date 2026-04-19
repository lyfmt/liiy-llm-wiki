import type { ChatAttachmentRef } from '../domain/chat-attachment.js';
import {
  loadChatAttachment,
  loadChatAttachmentMarkdown,
  loadChatAttachmentOriginal
} from '../storage/chat-attachment-store.js';
import type { RuntimeUserContentBlock, RuntimeUserMessage } from './chat-message-content.js';

const MAX_ATTACHMENT_MARKDOWN_CHARS = 20_000;

export async function buildUserMessageWithAttachments(
  root: string,
  prompt: string,
  attachments: ChatAttachmentRef[]
): Promise<RuntimeUserMessage> {
  return {
    role: 'user',
    content: await buildUserContentBlocksWithAttachments(root, prompt, attachments),
    timestamp: Date.now()
  };
}

export async function buildUserContentBlocksWithAttachments(
  root: string,
  prompt: string,
  attachments: ChatAttachmentRef[]
): Promise<RuntimeUserContentBlock[]> {
  const content: RuntimeUserContentBlock[] = [{ type: 'text', text: prompt }];

  for (const attachmentRef of attachments) {
    const attachment = await loadChatAttachment(root, attachmentRef.attachment_id);
    const markdown = await loadChatAttachmentMarkdown(root, attachmentRef.attachment_id);
    const trimmedMarkdown = clipAttachmentMarkdown(markdown);

    content.push({
      type: 'text',
      text: `Attached file: ${attachment.file_name}`
    });

    content.push({
      type: 'text',
      text: `Attachment handle: ${attachment.attachment_id}`
    });

    if (trimmedMarkdown.length > 0) {
      content.push({
        type: 'text',
        text: trimmedMarkdown
      });
    }

    if (attachment.kind === 'image') {
      const original = await loadChatAttachmentOriginal(root, attachmentRef.attachment_id);
      content.push({
        type: 'image',
        data: original.toString('base64'),
        mimeType: attachment.mime_type
      });
    }
  }

  return content;
}

function clipAttachmentMarkdown(markdown: string): string {
  const trimmed = markdown.trim();

  if (trimmed.length <= MAX_ATTACHMENT_MARKDOWN_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_ATTACHMENT_MARKDOWN_CHARS)}\n\n[Attachment markdown truncated]`;
}
