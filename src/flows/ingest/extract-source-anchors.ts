import path from 'node:path';

import type { SourceGroundedIngestEvidence } from '../../domain/source-grounded-ingest.js';

const ROOT_HEADING = 'Document';

export interface ExtractSourceAnchorsInput {
  sourceId: string;
  sourcePath: string;
  markdown: string;
}

export function extractSourceAnchors(input: ExtractSourceAnchorsInput): SourceGroundedIngestEvidence[] {
  const sourceId = requireNonEmptyString(input.sourceId, 'sourceId');
  const sourcePath = requireNonEmptyString(input.sourcePath, 'sourcePath');
  const markdown = typeof input.markdown === 'string' ? input.markdown : '';
  const basename = path.posix.basename(sourcePath);
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const anchors: SourceGroundedIngestEvidence[] = [];
  const paragraphLines: string[] = [];
  const headingStack: HeadingStackEntry[] = [];
  let paragraphIndex = 0;
  let openFence: FenceMarker | null = null;
  let openHtmlBlock: HtmlBlockState | null = null;
  let insideHtmlComment = false;
  let insideListBlock = false;

  const flushParagraph = (): void => {
    const excerpt = normalizeParagraph(paragraphLines);
    paragraphLines.length = 0;

    if (excerpt === '') {
      return;
    }

    const currentHeadingPath = headingStack.length === 0 ? [ROOT_HEADING] : headingStack.map((entry) => entry.title);
    const title = currentHeadingPath[currentHeadingPath.length - 1] ?? ROOT_HEADING;
    const headingSlug = slugifyHeadingPath(currentHeadingPath);
    const order = anchors.length + 1;

    paragraphIndex += 1;
    anchors.push({
      id: `evidence:${sourceId}#${order}`,
      title,
      locator: `${basename}#${headingSlug}:p${paragraphIndex}`,
      excerpt,
      order,
      heading_path: [...currentHeadingPath]
    });
  };

  for (const rawLine of [...lines, '']) {
    const trimmed = rawLine.trim();

    if (openFence !== null) {
      if (isFenceClose(trimmed, openFence)) {
        openFence = null;
      }
      continue;
    }

    if (openHtmlBlock !== null) {
      openHtmlBlock = advanceHtmlBlock(trimmed, openHtmlBlock);
      if (openHtmlBlock !== null && openHtmlBlock.depth <= 0) {
        openHtmlBlock = null;
      }
      continue;
    }

    if (insideHtmlComment) {
      if (isHtmlCommentCloseLine(trimmed)) {
        insideHtmlComment = false;
      }
      continue;
    }

    if (insideListBlock) {
      if (trimmed === '') {
        insideListBlock = false;
        continue;
      }

      if (isListItemLine(trimmed) || isListContinuationLine(rawLine)) {
        continue;
      }

      insideListBlock = false;
    }

    const fenceMarker = parseFenceMarker(trimmed);
    if (fenceMarker !== null) {
      flushParagraph();
      openFence = fenceMarker;
      continue;
    }

    if (isSingleLineHtmlBlock(trimmed)) {
      flushParagraph();
      continue;
    }

    if (isHtmlCommentLine(trimmed)) {
      flushParagraph();
      continue;
    }

    if (isHtmlCommentStartLine(trimmed)) {
      flushParagraph();
      insideHtmlComment = true;
      continue;
    }

    const htmlBlockTag = parseHtmlBlockTag(trimmed);
    if (htmlBlockTag !== null) {
      flushParagraph();
      const nextHtmlBlock = advanceHtmlBlock(trimmed, { tagName: htmlBlockTag, depth: 0 });
      if (nextHtmlBlock !== null && nextHtmlBlock.depth > 0) {
        openHtmlBlock = nextHtmlBlock;
      }
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();

      const level = headingMatch[1].length;
      const title = normalizeHeadingText(headingMatch[2]);
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]?.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, title });
      paragraphIndex = 0;
      continue;
    }

    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    if (isListItemLine(trimmed)) {
      flushParagraph();
      insideListBlock = true;
      continue;
    }

    if (isIgnoredStandaloneBlockLine(trimmed)) {
      flushParagraph();
      continue;
    }

    paragraphLines.push(rawLine);
  }

  return anchors;
}

function normalizeHeadingText(value: string): string {
  const withoutClosingHashes = value.replace(/\s+#+\s*$/, '');
  const normalized = withoutClosingHashes.trim();

  return normalized === '' ? ROOT_HEADING : normalized;
}

function normalizeParagraph(lines: string[]): string {
  return lines.map((line) => line.trim()).join(' ').replace(/\s+/g, ' ').trim();
}

interface FenceMarker {
  character: '`' | '~';
  length: number;
}

interface HeadingStackEntry {
  level: number;
  title: string;
}

interface HtmlBlockState {
  tagName: string;
  depth: number;
}

function parseFenceMarker(value: string): FenceMarker | null {
  const match = /^(?<marker>`{3,}|~{3,}).*$/.exec(value);
  const marker = match?.groups?.marker;

  if (marker === undefined) {
    return null;
  }

  return {
    character: marker[0] as '`' | '~',
    length: marker.length
  };
}

function isFenceClose(value: string, marker: FenceMarker): boolean {
  return new RegExp(`^\\${marker.character}{${marker.length},}\\s*$`).test(value);
}

function parseHtmlBlockTag(value: string): string | null {
  const match = /^<([A-Za-z][\w-]*)\b[^>]*>/.exec(value);
  if (match === null || match[0].endsWith('/>')) {
    return null;
  }

  return match[1].toLowerCase();
}

function isSingleLineHtmlBlock(value: string): boolean {
  return /^<([A-Za-z][\w-]*)\b[^>]*>.*<\/\1>\s*$/i.test(value);
}

function isHtmlCommentLine(value: string): boolean {
  return /^<!--.*-->\s*$/.test(value);
}

function isHtmlCommentStartLine(value: string): boolean {
  return /^<!--(?:\s*)$/.test(value);
}

function isHtmlCommentCloseLine(value: string): boolean {
  return /-->$/.test(value);
}

function advanceHtmlBlock(value: string, state: HtmlBlockState): HtmlBlockState | null {
  const openCount = countHtmlTagOpens(value, state.tagName);
  const closeCount = countHtmlTagCloses(value, state.tagName);
  const depth = state.depth + openCount - closeCount;

  if (depth <= 0) {
    return null;
  }

  return {
    tagName: state.tagName,
    depth
  };
}

function countHtmlTagOpens(value: string, tagName: string): number {
  const matches = value.match(new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, 'gi')) ?? [];

  return matches.filter((match) => !match.endsWith('/>')).length;
}

function countHtmlTagCloses(value: string, tagName: string): number {
  return value.match(new RegExp(`</${escapeRegExp(tagName)}>`, 'gi'))?.length ?? 0;
}

function isListItemLine(value: string): boolean {
  return /^([-*+]\s|\d+[.)]\s)/.test(value);
}

function isListContinuationLine(value: string): boolean {
  return /^\s+\S/.test(value);
}

function isIgnoredStandaloneBlockLine(value: string): boolean {
  return /^(>\s|\|)/.test(value);
}

function slugifyHeading(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function slugifyHeadingPath(headingPath: string[]): string {
  const normalized = headingPath
    .map((segment) => slugifyHeading(segment) || 'document')
    .filter((segment) => segment !== '');

  return normalized.join('/') || 'document';
}

function requireNonEmptyString(value: string | undefined, fieldName: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (normalized === '') {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
