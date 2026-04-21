import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';

import { buildProjectPaths } from '../../config/project-paths.js';
import type {
  DiscoverRuntimeSubagentsResult,
  RuntimeSubagentDiagnostic,
  SubagentFrontmatter,
  SubagentProfile
} from './types.js';

export async function discoverRuntimeSubagents(root: string): Promise<DiscoverRuntimeSubagentsResult> {
  const profilesRoot = buildProjectPaths(root).agentSubagents;
  const profiles: SubagentProfile[] = [];
  const diagnostics: RuntimeSubagentDiagnostic[] = [];
  const entries = await tryReadDirectory(profilesRoot);

  if (entries) {
    const profileDirectories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of profileDirectories) {
      const filePath = path.join(profilesRoot, entry.name, 'SUBAGENT.md');
      const profile = await tryParseProfile(filePath, diagnostics);

      if (profile) {
        profiles.push(profile);
      }
    }
  }

  diagnostics.sort((left, right) => left.path.localeCompare(right.path) || left.message.localeCompare(right.message));
  return { profiles, diagnostics };
}

async function tryReadDirectory(directoryPath: string) {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function tryParseProfile(
  filePath: string,
  diagnostics: RuntimeSubagentDiagnostic[]
): Promise<SubagentProfile | null> {
  try {
    return await parseProfile(filePath);
  } catch (error) {
    diagnostics.push({
      path: filePath,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function parseProfile(filePath: string): Promise<SubagentProfile> {
  const source = await readFile(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(source);
  const inferredName = path.basename(path.dirname(filePath));
  const name = parseRequiredString(frontmatter.name, 'subagent name is required', inferredName);

  return {
    name,
    description: parseRequiredString(frontmatter.description, 'subagent description is required'),
    systemPrompt: body.trim(),
    defaultTools: parseToolList(frontmatter['default-tools']),
    maxTools: parseToolList(frontmatter['max-tools']),
    receiptSchema: parseRequiredString(frontmatter['receipt-schema'], 'subagent receipt schema is required'),
    filePath
  };
}

function parseFrontmatter(source: string): { frontmatter: SubagentFrontmatter; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u);

  if (!match) {
    throw new Error('subagent frontmatter is required');
  }

  let document;

  try {
    document = parseDocument(match[1]);
  } catch {
    throw new Error('subagent frontmatter is malformed');
  }

  if (document.errors.length > 0) {
    throw new Error('subagent frontmatter is malformed');
  }

  const value = document.toJS({ mapAsMap: false });

  if (!isRecord(value)) {
    throw new Error('subagent frontmatter must be a mapping');
  }

  return {
    frontmatter: value,
    body: match[2] ?? ''
  };
}

function parseRequiredString(value: unknown, errorMessage: string, fallback?: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback.trim();
  }

  throw new Error(errorMessage);
}

function parseToolList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/\s+/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }

  return [];
}

function isRecord(value: unknown): value is SubagentFrontmatter {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
