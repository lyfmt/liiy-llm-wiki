import { clsx, type ClassValue } from 'clsx';
import type { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export interface MarkdownHeading {
  depth: 2 | 3;
  text: string;
  id: string;
}

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function clampTags(tags: string[], limit = 3): string[] {
  return tags.slice(0, limit);
}

export function extractTextContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => extractTextContent(child)).join('');
  }

  if (node && typeof node === 'object' && 'props' in node) {
    return extractTextContent((node as { props?: { children?: ReactNode } }).props?.children ?? '');
  }

  return '';
}

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{}|\\:;"'<>,.?/]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

export function extractMarkdownHeadings(body: string): MarkdownHeading[] {
  return body
    .split('\n')
    .map((line) => /^(#{2,3})\s+(.+)$/u.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({
      depth: match[1].length as 2 | 3,
      text: match[2].trim(),
      id: slugifyHeading(match[2])
    }));
}
