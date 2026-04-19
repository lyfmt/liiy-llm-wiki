import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';

import type {
  DiscoverRuntimeSkillsResult,
  LoadedSkillDocument,
  RuntimeSkillDiagnostic,
  SkillFrontmatter,
  SkillSummary
} from './types.js';

const PROJECT_SKILLS_DIRECTORY = path.join('.agents', 'skills');

export async function discoverRuntimeSkills(root: string): Promise<DiscoverRuntimeSkillsResult> {
  const skillsRoot = path.join(root, PROJECT_SKILLS_DIRECTORY);
  const skills: SkillSummary[] = [];
  const diagnostics: RuntimeSkillDiagnostic[] = [];

  await collectSkills(skillsRoot, skills, diagnostics);

  skills.sort((left, right) => left.name.localeCompare(right.name));
  diagnostics.sort((left, right) => left.path.localeCompare(right.path) || left.message.localeCompare(right.message));

  return { skills, diagnostics };
}

export async function loadRuntimeSkillDocument(skill: SkillSummary): Promise<LoadedSkillDocument> {
  return parseSkillFile(skill.filePath);
}

async function collectSkills(
  directoryPath: string,
  skills: SkillSummary[],
  diagnostics: RuntimeSkillDiagnostic[]
): Promise<void> {
  const entries = await tryReadDirectory(directoryPath);

  if (!entries) {
    return;
  }

  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  const skillEntry = sortedEntries.find((entry) => entry.isFile() && entry.name === 'SKILL.md');

  if (skillEntry) {
    const skillPath = path.join(directoryPath, skillEntry.name);
    const document = await tryParseSkillFile(skillPath, diagnostics);

    if (document) {
      skills.push({
        name: document.name,
        description: document.description,
        allowedTools: document.allowedTools,
        filePath: document.filePath,
        baseDir: document.baseDir
      });
    }

    return;
  }

  for (const entry of sortedEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }

    await collectSkills(path.join(directoryPath, entry.name), skills, diagnostics);
  }
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

async function tryParseSkillFile(
  filePath: string,
  diagnostics: RuntimeSkillDiagnostic[]
): Promise<LoadedSkillDocument | null> {
  try {
    return await parseSkillFile(filePath);
  } catch (error) {
    diagnostics.push({
      path: filePath,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function parseSkillFile(filePath: string): Promise<LoadedSkillDocument> {
  const source = await readFile(filePath, 'utf8');
  const frontmatter = parseSkillFrontmatter(source);
  const baseDir = path.dirname(filePath);
  const inferredName = path.basename(baseDir);
  const providedName = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
  const name = providedName.length > 0 ? providedName : inferredName;
  const description = parseRequiredDescription(frontmatter.description);
  const allowedTools = parseAllowedTools(frontmatter['allowed-tools']);

  return {
    name,
    description,
    allowedTools,
    filePath,
    baseDir,
    source,
    frontmatter
  };
}

function parseSkillFrontmatter(source: string): SkillFrontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);

  if (!match) {
    throw new Error('skill frontmatter is required');
  }

  let document;

  try {
    document = parseDocument(match[1]);
  } catch {
    throw new Error('skill frontmatter is malformed');
  }

  if (document.errors.length > 0) {
    throw new Error('skill frontmatter is malformed');
  }

  const value = document.toJS({ mapAsMap: false });

  if (!isRecord(value)) {
    throw new Error('skill frontmatter must be a mapping');
  }

  return value;
}

function parseRequiredDescription(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('skill description is required');
  }

  return value.trim();
}

function parseAllowedTools(value: unknown): string[] {
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

function isRecord(value: unknown): value is SkillFrontmatter {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
