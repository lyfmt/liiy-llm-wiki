import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { resolveStateArtifactPath } from '../../storage/subagent-artifact-paths.js';
import type { RuntimeContext } from '../runtime-context.js';
import type { RuntimeToolOutcome } from '../request-run-state.js';
import type { PreparedSourceResourceArtifact } from './prepare-source-resource.js';

const parameters = Type.Object({
  resourceArtifact: Type.String({ description: 'Prepared source resource artifact under state/artifacts/.' }),
  outputArtifact: Type.String({ description: 'Artifact path for the split blocks JSON.' })
});

export type SplitResourceBlocksParameters = Static<typeof parameters>;

export interface KnowledgeResourceBlock {
  blockId: string;
  headingPath: string[];
  locator: string;
  text: string;
  kind: 'paragraph' | 'list_item' | 'table_row';
}

export interface SplitResourceBlocksArtifact {
  manifestId: string;
  rawPath: string;
  blocks: KnowledgeResourceBlock[];
}

export function createSplitResourceBlocksTool(
  runtimeContext: RuntimeContext
): AgentTool<typeof parameters, RuntimeToolOutcome> {
  return {
    name: 'split_resource_blocks',
    label: 'Split Resource Blocks',
    description:
      'Split a prepared source resource artifact into stable knowledge blocks keyed by heading path and locator.',
    parameters,
    execute: async (_toolCallId, params) => {
      const resolvedInput = resolveStateArtifactPath(runtimeContext.root, params.resourceArtifact);
      const resolvedOutput = resolveStateArtifactPath(runtimeContext.root, params.outputArtifact);
      const resource = parsePreparedResourceArtifact(await readFile(resolvedInput.absolutePath, 'utf8'));
      const blocks = splitMarkdownIntoBlocks(resource.structuredMarkdown);
      const artifact: SplitResourceBlocksArtifact = {
        manifestId: resource.manifestId,
        rawPath: resource.rawPath,
        blocks
      };

      await mkdir(path.dirname(resolvedOutput.absolutePath), { recursive: true });
      await writeFile(resolvedOutput.absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

      const outcome: RuntimeToolOutcome = {
        toolName: 'split_resource_blocks',
        summary: `split resource into ${blocks.length} source blocks`,
        evidence: [resolvedInput.absolutePath],
        touchedFiles: [resolvedOutput.projectPath],
        data: {
          manifestId: resource.manifestId,
          rawPath: resource.rawPath,
          blockCount: blocks.length,
          artifactPath: resolvedOutput.artifactPath,
          projectPath: resolvedOutput.projectPath
        },
        resultMarkdown: [
          `Split resource manifest: ${resource.manifestId}`,
          `Raw path: ${resource.rawPath}`,
          `Blocks: ${blocks.length}`,
          `Artifact: ${resolvedOutput.projectPath}`
        ].join('\n')
      };

      return {
        content: [{ type: 'text', text: outcome.resultMarkdown ?? outcome.summary }],
        details: outcome
      };
    }
  };
}

function parsePreparedResourceArtifact(content: string): PreparedSourceResourceArtifact {
  const value = JSON.parse(content) as unknown;

  if (!isRecord(value) || typeof value.manifestId !== 'string' || typeof value.rawPath !== 'string' || typeof value.structuredMarkdown !== 'string') {
    throw new Error('Invalid prepared source resource artifact');
  }

  return {
    manifestId: value.manifestId,
    rawPath: value.rawPath,
    structuredMarkdown: value.structuredMarkdown,
    sectionHints: Array.isArray(value.sectionHints) ? value.sectionHints.filter((hint): hint is string => typeof hint === 'string') : [],
    topicHints: Array.isArray(value.topicHints) ? value.topicHints.filter((hint): hint is string => typeof hint === 'string') : [],
    sections:
      Array.isArray(value.sections) &&
      value.sections.every(
        (section) =>
          isRecord(section) &&
          Array.isArray(section.headingPath) &&
          section.headingPath.every((entry) => typeof entry === 'string') &&
          typeof section.startLine === 'number' &&
          typeof section.endLine === 'number'
      )
        ? value.sections.map((section) => ({
            headingPath: [...(section.headingPath as string[])],
            startLine: section.startLine as number,
            endLine: section.endLine as number
          }))
        : [],
    metadata: {
      title: readMetadataField(value.metadata, 'title'),
      type: readMetadataField(value.metadata, 'type'),
      status: readMetadataField(value.metadata, 'status'),
      hash: readMetadataField(value.metadata, 'hash'),
      importedAt: readMetadataField(value.metadata, 'importedAt'),
      preparedAt: readMetadataField(value.metadata, 'preparedAt')
    }
  };
}

function splitMarkdownIntoBlocks(markdown: string): KnowledgeResourceBlock[] {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const blocks: KnowledgeResourceBlock[] = [];
  let headingPath: string[] = [];
  let paragraphBuffer: string[] = [];
  const sectionCounters = new Map<string, { paragraph: number; list: number; table: number }>();

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }

    const text = paragraphBuffer.join(' ').trim();
    paragraphBuffer = [];

    if (text.length === 0) {
      return;
    }

    const blockId = formatBlockId(blocks.length + 1);
    const sectionKey = buildSectionKey(headingPath);
    const counters = sectionCounters.get(sectionKey) ?? { paragraph: 0, list: 0, table: 0 };
    counters.paragraph += 1;
    sectionCounters.set(sectionKey, counters);
    blocks.push({
      blockId,
      headingPath: [...headingPath],
      locator: `${buildLocatorPrefix(headingPath)}#p${counters.paragraph}`,
      text,
      kind: 'paragraph'
    });
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/u);

    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      headingPath = [...headingPath.slice(0, level - 1), headingText];
      continue;
    }

    const listMatch = trimmed.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/u);

    if (listMatch) {
      flushParagraph();
      const sectionKey = buildSectionKey(headingPath);
      const counters = sectionCounters.get(sectionKey) ?? { paragraph: 0, list: 0, table: 0 };
      counters.list += 1;
      sectionCounters.set(sectionKey, counters);
      blocks.push({
        blockId: formatBlockId(blocks.length + 1),
        headingPath: [...headingPath],
        locator: `${buildLocatorPrefix(headingPath)}#li${counters.list}`,
        text: listMatch[1].trim(),
        kind: 'list_item'
      });
      continue;
    }

    if (isMarkdownTableRow(trimmed)) {
      flushParagraph();

      if (isMarkdownTableSeparator(trimmed)) {
        continue;
      }

      const sectionKey = buildSectionKey(headingPath);
      const counters = sectionCounters.get(sectionKey) ?? { paragraph: 0, list: 0, table: 0 };
      counters.table += 1;
      sectionCounters.set(sectionKey, counters);
      blocks.push({
        blockId: formatBlockId(blocks.length + 1),
        headingPath: [...headingPath],
        locator: `${buildLocatorPrefix(headingPath)}#tr${counters.table}`,
        text: normalizeMarkdownTableRow(trimmed),
        kind: 'table_row'
      });
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();

  return blocks;
}

function formatBlockId(index: number): string {
  return `block-${String(index).padStart(3, '0')}`;
}

function buildSectionKey(headingPath: string[]): string {
  return headingPath.join('\u241f');
}

function buildLocatorPrefix(headingPath: string[]): string {
  if (headingPath.length === 0) {
    return 'root';
  }

  return headingPath.map((heading, index) => `h${index + 1}:${heading}`).join(' > ');
}

function isMarkdownTableRow(line: string): boolean {
  return line.includes('|') && /^\|.*\|$/u.test(line);
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = line
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);

  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function normalizeMarkdownTableRow(line: string): string {
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
    .join(' | ');
}

function readMetadataField(metadata: unknown, field: string): string {
  if (!isRecord(metadata) || typeof metadata[field] !== 'string') {
    return '';
  }

  return metadata[field];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
