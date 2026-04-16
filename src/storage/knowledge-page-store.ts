import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

export async function saveKnowledgePage(root: string, page: KnowledgePage, body: string): Promise<string> {
  const slug = path.basename(page.path, '.md');
  const filePath = buildKnowledgePagePath(root, page.kind, slug);

  if (page.path !== filePathToPagePath(page.kind, slug)) {
    throw new Error('Invalid knowledge page: path does not match kind directory');
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\n${renderFrontmatter(page)}---\n${body}`, 'utf8');

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
  if (!markdown.startsWith('---\n')) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  const endIndex = markdown.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    throw new Error('Invalid knowledge page: malformed frontmatter');
  }

  return [markdown.slice(4, endIndex), markdown.slice(endIndex + 5)];
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
