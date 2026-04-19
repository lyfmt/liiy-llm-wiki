export type ChatAttachmentKind = 'image' | 'pdf' | 'text';
export type ChatAttachmentStatus = 'buffered' | 'persisted';

export interface ChatAttachmentRef {
  attachment_id: string;
  file_name: string;
  mime_type: string;
  kind: ChatAttachmentKind;
}

export interface ChatAttachmentRecord extends ChatAttachmentRef {
  session_id: string;
  created_at: string;
  status: ChatAttachmentStatus;
  size_bytes: number;
  original_rel_path: string;
  markdown_rel_path: string;
  markdown_char_count: number;
  expires_at: string;
}

export interface CreateChatAttachmentRecordInput extends ChatAttachmentRef {
  session_id: string;
  created_at?: string;
  status?: ChatAttachmentStatus;
  size_bytes: number;
  original_rel_path: string;
  markdown_rel_path: string;
  markdown_char_count: number;
  expires_at?: string;
}

export function createChatAttachmentRecord(input: CreateChatAttachmentRecordInput): ChatAttachmentRecord {
  const createdAt = input.created_at ?? new Date().toISOString();

  return {
    attachment_id: input.attachment_id,
    file_name: input.file_name.trim(),
    mime_type: input.mime_type.trim(),
    kind: input.kind,
    session_id: input.session_id,
    created_at: createdAt,
    status: input.status ?? 'buffered',
    size_bytes: input.size_bytes,
    original_rel_path: input.original_rel_path,
    markdown_rel_path: input.markdown_rel_path,
    markdown_char_count: input.markdown_char_count,
    expires_at: input.expires_at ?? new Date(Date.parse(createdAt) + 1000 * 60 * 60 * 24).toISOString()
  };
}

export function toChatAttachmentRef(record: ChatAttachmentRecord): ChatAttachmentRef {
  return {
    attachment_id: record.attachment_id,
    file_name: record.file_name,
    mime_type: record.mime_type,
    kind: record.kind
  };
}

export function inferChatAttachmentKind(fileName: string, mimeType: string): ChatAttachmentKind {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedFileName = fileName.toLowerCase();

  if (normalizedMimeType.startsWith('image/')) {
    return 'image';
  }

  if (normalizedMimeType === 'application/pdf' || normalizedFileName.endsWith('.pdf')) {
    return 'pdf';
  }

  return 'text';
}
