import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createSourceManifest,
  type SourceManifest,
  type SourceManifestStatus
} from '../domain/source-manifest.js';
import { buildSourceManifestPath } from './source-manifest-paths.js';

export async function saveSourceManifest(root: string, manifest: SourceManifest): Promise<string> {
  if (!isRawPath(manifest.path)) {
    throw new Error(`Invalid source manifest: invalid ${manifest.id}.json`);
  }

  const filePath = buildSourceManifestPath(root, manifest.id);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return filePath;
}

export async function loadSourceManifest(root: string, id: string): Promise<SourceManifest> {
  const filePath = buildSourceManifestPath(root, id);
  const record = assertSourceManifestRecord(await readRequiredJson(filePath, `${id}.json`), `${id}.json`);

  return createSourceManifest(record);
}

export async function findAcceptedSourceManifestByPath(root: string, rawPath: string): Promise<SourceManifest> {
  if (!isRawPath(rawPath)) {
    throw new Error(`Invalid source manifest path lookup: ${rawPath}`);
  }

  const manifests = await listSourceManifests(root);
  const matches = manifests.filter((manifest) => manifest.status === 'accepted' && manifest.path === rawPath);

  if (matches.length === 0) {
    throw new Error(`No accepted source manifest found for path: ${rawPath}`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Ambiguous accepted source manifest for path ${rawPath}: ${matches.map((manifest) => manifest.id).join(', ')}`
    );
  }

  return matches[0]!;
}

async function listSourceManifests(root: string): Promise<SourceManifest[]> {
  const manifestDirectory = path.dirname(buildSourceManifestPath(root, 'placeholder-id'));

  let entries: string[];

  try {
    entries = await readdir(manifestDirectory);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const manifestIds = entries.filter((entry) => entry.endsWith('.json')).map((entry) => entry.slice(0, -'.json'.length));
  const manifests: SourceManifest[] = [];

  for (const manifestId of manifestIds.sort()) {
    manifests.push(await loadSourceManifest(root, manifestId));
  }

  return manifests;
}

function assertSourceManifestRecord(
  value: unknown,
  fileName: string
): {
  id: string;
  path: string;
  title: string;
  type: string;
  status: SourceManifestStatus;
  hash: string;
  imported_at: string;
  tags: string[];
  notes: string;
} {
  if (!isRecord(value)) {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }

  if (typeof value.id !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.path !== 'string' || !isRawPath(value.path)) {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.title !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.type !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (value.status !== 'inbox' && value.status !== 'accepted' && value.status !== 'rejected' && value.status !== 'processed') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.hash !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.imported_at !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (!Array.isArray(value.tags) || value.tags.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }
  if (typeof value.notes !== 'string') {
    throw new Error(`Invalid source manifest: invalid ${fileName}`);
  }

  return {
    id: value.id,
    path: value.path,
    title: value.title,
    type: value.type,
    status: value.status,
    hash: value.hash,
    imported_at: value.imported_at,
    tags: value.tags,
    notes: value.notes
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRawPath(value: string): boolean {
  if (value === 'raw') {
    return true;
  }

  if (!value.startsWith('raw/')) {
    return false;
  }

  if (value.includes('\\')) {
    return false;
  }

  return !value.split('/').some((segment) => segment === '.' || segment === '..' || segment.length === 0);
}

async function readRequiredJson(filePath: string, fileName: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Incomplete source manifest state: missing ${fileName}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid source manifest: malformed ${fileName}`);
    }

    throw error;
  }
}
