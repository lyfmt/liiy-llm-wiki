import { chmod, copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, '.githooks');

async function resolveHooksDir() {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: repoRoot
  });

  return path.resolve(repoRoot, stdout.trim());
}

async function installHook(name) {
  const hooksDir = await resolveHooksDir();
  const sourcePath = path.join(sourceDir, name);
  const targetPath = path.join(hooksDir, name);

  await mkdir(hooksDir, { recursive: true });
  await copyFile(sourcePath, targetPath);
  await chmod(targetPath, 0o755);
}

async function main() {
  try {
    await stat(path.join(repoRoot, '.git'));
  } catch {
    return;
  }

  await installHook('pre-commit');
  await installHook('pre-push');
}

await main();
