import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

import { buildProjectPaths } from '../config/project-paths.js';

export interface ProjectEnvState {
  path: string;
  contents: string;
  values: Record<string, string>;
  keys: string[];
}

export async function loadProjectEnv(root: string): Promise<ProjectEnvState> {
  const filePath = buildProjectPaths(root).projectEnv;

  try {
    const contents = await readFile(filePath, 'utf8');
    const values = parseProjectEnv(contents);

    return {
      path: filePath,
      contents,
      values,
      keys: Object.keys(values)
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        path: filePath,
        contents: '',
        values: {},
        keys: []
      };
    }

    throw error;
  }
}

export function loadProjectEnvSync(root: string): ProjectEnvState {
  const filePath = buildProjectPaths(root).projectEnv;

  try {
    const contents = readFileSync(filePath, 'utf8');
    const values = parseProjectEnv(contents);

    return {
      path: filePath,
      contents,
      values,
      keys: Object.keys(values)
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        path: filePath,
        contents: '',
        values: {},
        keys: []
      };
    }

    throw error;
  }
}

export async function saveProjectEnv(root: string, contents: string): Promise<string> {
  const filePath = buildProjectPaths(root).projectEnv;

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, normalizeProjectEnvContents(contents), 'utf8');

  return filePath;
}

export async function upsertProjectEnvValue(root: string, key: string, value: string): Promise<string> {
  const state = await loadProjectEnv(root);

  return saveProjectEnv(root, upsertEnvAssignment(state.contents, key, value));
}

export function parseProjectEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separatorIndex = normalized.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const parsedKey = normalized.slice(0, separatorIndex).trim();
    const rawValue = normalized.slice(separatorIndex + 1).trim();

    if (parsedKey === '') {
      continue;
    }

    values[parsedKey] = stripMatchingQuotes(rawValue);
  }

  return values;
}

export function upsertEnvAssignment(contents: string, key: string, value: string): string {
  const normalizedKey = normalizeEnvKey(key);
  const normalizedValue = serializeEnvValue(value);
  const lines = contents === '' ? [] : contents.split(/\r?\n/u);
  const nextLines: string[] = [];
  let replaced = false;

  for (const line of lines) {
    if (line === '' && nextLines.length === lines.length - 1) {
      continue;
    }

    if (matchesEnvKey(line, normalizedKey)) {
      if (!replaced) {
        nextLines.push(`${normalizedKey}=${normalizedValue}`);
        replaced = true;
      }

      continue;
    }

    nextLines.push(line);
  }

  if (!replaced) {
    nextLines.push(`${normalizedKey}=${normalizedValue}`);
  }

  return normalizeProjectEnvContents(nextLines.join('\n'));
}

function normalizeProjectEnvContents(contents: string): string {
  if (contents.trim() === '') {
    return '';
  }

  return contents.endsWith('\n') ? contents : `${contents}\n`;
}

function normalizeEnvKey(key: string): string {
  const normalized = key.trim();

  if (!/^[A-Z_][A-Z0-9_]*$/u.test(normalized)) {
    throw new Error('Invalid project env key');
  }

  return normalized;
}

function matchesEnvKey(line: string, key: string): boolean {
  const trimmed = line.trim();
  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;

  return normalized.startsWith(`${key}=`);
}

function serializeEnvValue(value: string): string {
  const normalized = value.replace(/[\r\n]+/gu, '').trim();

  if (normalized === '') {
    return '';
  }

  if (/^[^\s#"']+$/u.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function stripMatchingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}
