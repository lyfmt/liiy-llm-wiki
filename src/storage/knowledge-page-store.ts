import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument, stringify } from 'yaml';

import {
  createKnowledgePage,
  type KnowledgePage,
  type KnowledgePageKind
} from '../domain/knowledge-page.js';
import { buildKnowledgePagePath } from './knowledge-page-paths.js';

export interface LoadedKnowledgePage {
  page: KnowledgePage;
  body: string;
}

const FRONTMATTER_START = '---\n';
const FRONTMATTER_END = '\n---\n';
const FRONTMATTER_CHUNK_BYTES = 4096;
const FRONTMATTER_MAX_BYTES = 2 * 1024 * 1024;
const MAX_SUMMARY_CHARACTERS = 30;

export async function saveKnowledgePage(root: string, page: KnowledgePage, body: string): Promise<string> {
  const normalizedPage = normalizeKnowledgePageForStorage(page, body);
  const slug = path.basename(normalizedPage.path, '.md');
  const filePath = buildKnowledgePagePath(root, page.kind, slug);

  if (normalizedPage.path !== filePathToPagePath(normalizedPage.kind, slug)) {
    throw new Error('Invalid knowledge page: path does not match kind directory');
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${FRONTMATTER_START}${renderFrontmatter(normalizedPage)}---\n${body}`, 'utf8');

  return filePath;
}

export async function loadKnowledgePage(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<LoadedKnowledgePage> {
  const filePath = buildKnowledgePagePath(root, kind, slug);
  const markdown = await readFile(filePath, 'utf8');
  const [frontmatter, body] = splitFrontmatter(markdown);
  const record = parseFrontmatter(frontmatter);

  if (record.kind !== kind) {
    throw new Error('Invalid knowledge page: kind does not match requested location');
  }

  return {
    page: createKnowledgePage({
      path: filePathToPagePath(kind, slug),
      kind,
      title: record.title,
      aliases: record.aliases,
      summary: record.summary,
      tags: record.tags,
      source_refs: record.source_refs,
      outgoing_links: record.outgoing_links,
      status: record.status,
      updated_at: record.updated_at
    }),
    body
  };
}

export async function loadKnowledgePageMetadata(
  root: string,
  kind: KnowledgePageKind,
  slug: string
): Promise<KnowledgePage> {
  const filePath = buildKnowledgePagePath(root, kind, slug);
  const record = parseFrontmatter(await readFrontmatter(filePath));

  if (record.kind !== kind) {
    throw new Error('Invalid knowledge page: kind does not match requested location');
  }

  return createKnowledgePage({
    path: filePathToPagePath(kind, slug),
    kind,
    title: record.title,
    aliases: record.aliases,
    summary: record.summary,
    tags: record.tags,
    source_refs: record.source_refs,
    outgoing_links: record.outgoing_links,
    status: record.status,
    updated_at: record.updated_at
  });
}

export function deriveKnowledgePageSummary(summary: string | undefined, title: string, body: string): string {
  const cleanedSummary = cleanSummarySource(summary ?? '');

  if (cleanedSummary.length > 0) {
    return truncateSummary(cleanedSummary);
  }

  const cleanedBody = cleanSummarySource(body);
  const withoutRepeatedTitle = stripLeadingTitle(cleanedBody, title);

  if (withoutRepeatedTitle.length > 0) {
    return truncateSummary(withoutRepeatedTitle);
  }

  return truncateSummary(cleanSummarySource(title));
}

export function normalizeKnowledgePageForStorage(page: KnowledgePage, body: string): KnowledgePage {
  return createKnowledgePage({
    path: page.path,
    kind: page.kind,
    title: page.title,
    aliases: page.aliases,
    summary: deriveKnowledgePageSummary(page.summary, page.title, body),
    tags: page.tags,
    source_refs: page.source_refs,
    outgoing_links: page.outgoing_links,
    status: page.status,
    updated_at: page.updated_at
  });
}

function filePathToPagePath(kind: KnowledgePageKind, slug: string): string {
  return `wiki/${directoryNameForKind(kind)}/${slug}.md`;
}

function directoryNameForKind(kind: KnowledgePageKind): string {
  return kind === 'source'
    ? 'sources'
    : kind === 'entity'
      ? 'entities'
      : kind === 'query'
        ? 'queries'
        : 'topics';
}

function splitFrontmatter(markdown: string): [string, string] {
  if (!markdown.startsWith(FRONTMATTER_START)) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  const endIndex = markdown.indexOf(FRONTMATTER_END, FRONTMATTER_START.length);

  if (endIndex === -1) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  return [markdown.slice(FRONTMATTER_START.length, endIndex), markdown.slice(endIndex + FRONTMATTER_END.length)];
}

function parseFrontmatter(frontmatter: string): {
  kind: KnowledgePageKind;
  title: string;
  aliases: string[];
  summary: string;
  tags: string[];
  source_refs: string[];
  outgoing_links: string[];
  status: string;
  updated_at: string;
} {
  let document;

  try {
    document = parseDocument(frontmatter);
  } catch {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  if (document.errors.length > 0) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  const value = document.toJS({ mapAsMap: false });

  if (!isRecord(value)) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  const kind = parseKind(value.kind);
  const title = parseStringField(value.title);
  const aliases = parseStringArrayField(value.aliases);
  const summary = parseOptionalStringField(value.summary);
  const tags = parseOptionalStringArrayField(value.tags);
  const source_refs = parseStringArrayField(value.source_refs);
  const outgoing_links = parseStringArrayField(value.outgoing_links);
  const status = parseStringField(value.status);
  const updated_at = parseStringField(value.updated_at);

  return {
    kind,
    title,
    aliases,
    summary,
    tags,
    source_refs,
    outgoing_links,
    status,
    updated_at
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseKind(value: unknown): KnowledgePageKind {
  if (value === 'source' || value === 'entity' || value === 'topic' || value === 'query') {
    return value;
  }

  throw new Error('Invalid knowledge page: malformed frontmatter');
}

function parseStringField(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  return value;
}

function parseOptionalStringField(value: unknown): string {
  if (value === undefined) {
    return '';
  }

  return parseStringField(value);
}

function parseStringArrayField(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  return [...value];
}

function parseOptionalStringArrayField(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  return parseStringArrayField(value);
}

function renderFrontmatter(page: KnowledgePage): string {
  return stringify(
    {
      kind: page.kind,
      title: page.title,
      aliases: page.aliases,
      summary: page.summary,
      tags: page.tags,
      source_refs: page.source_refs,
      outgoing_links: page.outgoing_links,
      status: page.status,
      updated_at: page.updated_at
    },
    {
      lineWidth: 0,
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN'
    }
  );
}

async function readFrontmatter(filePath: string): Promise<string> {
  const handle = await open(filePath, 'r');
  const decoder = new TextDecoder('utf-8');
  const buffer = Buffer.alloc(FRONTMATTER_CHUNK_BYTES);
  let collected = '';
  let position = 0;

  try {
    while (position <= FRONTMATTER_MAX_BYTES) {
      const { bytesRead } = await handle.read({ buffer, offset: 0, length: buffer.length, position });

      if (bytesRead === 0) {
        break;
      }

      position += bytesRead;
      collected += decoder.decode(buffer.subarray(0, bytesRead), { stream: true });

      if (!collected.startsWith(FRONTMATTER_START)) {
        throw new Error('Invalid knowledge page: malformed frontmatter');
      }

      const endIndex = collected.indexOf(FRONTMATTER_END, FRONTMATTER_START.length);

      if (endIndex !== -1) {
        return collected.slice(FRONTMATTER_START.length, endIndex);
      }
    }

    collected += decoder.decode();
  } finally {
    await handle.close();
  }

  if (!collected.startsWith(FRONTMATTER_START)) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  const endIndex = collected.indexOf(FRONTMATTER_END, FRONTMATTER_START.length);

  if (endIndex === -1) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  return collected.slice(FRONTMATTER_START.length, endIndex);
}

function cleanSummarySource(value: string): string {
  return value
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/u, '')
        .replace(/^>\s?/u, '')
        .replace(/^[-*+]\s+/u, '')
        .replace(/^\d+\.\s+/u, '')
        .trim()
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function stripLeadingTitle(value: string, title: string): string {
  if (value.length === 0) {
    return value;
  }

  const normalizedTitle = title.trim();

  if (normalizedTitle.length === 0) {
    return value;
  }

  if (!value.startsWith(normalizedTitle)) {
    return value;
  }

  const stripped = value.slice(normalizedTitle.length).trimStart();

  return stripped.length > 0 ? stripped : value;
}

function truncateSummary(value: string): string {
  const characters = Array.from(value);

  return characters.length <= MAX_SUMMARY_CHARACTERS
    ? value
    : characters.slice(0, MAX_SUMMARY_CHARACTERS).join('');
}
