export type RuntimeUserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface RuntimeUserMessage {
  role: 'user';
  content: RuntimeUserContentBlock[];
  timestamp?: number;
}

export type RuntimeConversationMessage =
  | { role: 'user'; content: RuntimeUserContentBlock[] }
  | { role: 'assistant'; content: string };
