import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

function isAcceptedRawPath(value: string): boolean {
  if (!value.startsWith('raw/accepted/')) {
    return false;
  }

  if (value.includes('\\')) {
    return false;
  }

  return !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

export async function readRawDocument(root: string, rawPath: string): Promise<string> {
  if (!isAcceptedRawPath(rawPath)) {
    throw new Error('Invalid raw document path');
  }

  const acceptedRoot = path.join(root, 'raw', 'accepted');
  const candidatePath = path.join(root, rawPath);

  try {
    const resolvedPath = await realpath(candidatePath);
    const resolvedAcceptedRoot = await realpath(acceptedRoot);
    const normalizedAcceptedRoot = resolvedAcceptedRoot.endsWith(path.sep)
      ? resolvedAcceptedRoot
      : `${resolvedAcceptedRoot}${path.sep}`;

    if (resolvedPath !== resolvedAcceptedRoot && !resolvedPath.startsWith(normalizedAcceptedRoot)) {
      throw new Error('Invalid raw document path');
    }

    return await readFile(resolvedPath, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Invalid raw document path') {
      throw error;
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Missing raw document: ${rawPath}`);
    }

    throw error;
  }
}
