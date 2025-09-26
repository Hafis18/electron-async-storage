import {
  Dirent,
  existsSync,
  promises as fsPromises,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  mkdirSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { resolve, dirname } from "node:path";

function ignoreNotfound(err: any) {
  return err.code === "ENOENT" || err.code === "EISDIR" ? null : err;
}

function ignoreExists(err: any) {
  return err.code === "EEXIST" ? null : err;
}

type WriteFileData = Parameters<typeof fsPromises.writeFile>[1];
export async function writeFile(
  path: string,
  data: WriteFileData,
  encoding?: BufferEncoding
) {
  await ensuredir(dirname(path));
  return fsPromises.writeFile(path, data, encoding);
}

export function readFile(path: string, encoding?: BufferEncoding) {
  return fsPromises.readFile(path, encoding).catch(ignoreNotfound);
}

export function stat(path: string) {
  return fsPromises.stat(path).catch(ignoreNotfound);
}

export function unlink(path: string) {
  return fsPromises.unlink(path).catch(ignoreNotfound);
}

export function readdir(dir: string): Promise<Dirent[]> {
  return fsPromises
    .readdir(dir, { withFileTypes: true })
    .catch(ignoreNotfound)
    .then((r) => r || []);
}

export async function ensuredir(dir: string) {
  if (existsSync(dir)) {
    return;
  }
  await ensuredir(dirname(dir)).catch(ignoreExists);
  await fsPromises.mkdir(dir).catch(ignoreExists);
}

export async function readdirRecursive(
  dir: string,
  ignore?: (p: string) => boolean,
  maxDepth?: number
) {
  if (ignore && ignore(dir)) {
    return [];
  }
  const entries: Dirent[] = await readdir(dir);
  const files: string[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (maxDepth === undefined || maxDepth > 0) {
          const dirFiles = await readdirRecursive(
            entryPath,
            ignore,
            maxDepth === undefined ? undefined : maxDepth - 1
          );
          files.push(...dirFiles.map((f) => entry.name + "/" + f));
        }
      } else {
        if (!(ignore && ignore(entry.name))) {
          files.push(entry.name);
        }
      }
    })
  );
  return files;
}

export async function rmRecursive(dir: string) {
  const entries = await readdir(dir);
  await Promise.all(
    entries.map((entry) => {
      const entryPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        return rmRecursive(entryPath).then(() => fsPromises.rmdir(entryPath));
      } else {
        return fsPromises.unlink(entryPath);
      }
    })
  );
}

// Synchronous versions
export function syncWriteFile(
  path: string,
  data: Parameters<typeof writeFileSync>[1],
  encoding?: BufferEncoding
) {
  syncEnsuredir(dirname(path));
  return writeFileSync(path, data, encoding);
}

export function syncReadFile(path: string, encoding?: BufferEncoding) {
  try {
    return readFileSync(path, encoding);
  } catch (err: any) {
    const ignored = ignoreNotfound(err);
    if (ignored === null) return null;
    throw err;
  }
}

export function syncStat(path: string) {
  try {
    return statSync(path);
  } catch (err: any) {
    const ignored = ignoreNotfound(err);
    if (ignored === null) return null;
    throw err;
  }
}

export function syncUnlink(path: string) {
  try {
    return unlinkSync(path);
  } catch (err: any) {
    const ignored = ignoreNotfound(err);
    if (ignored === null) return;
    throw err;
  }
}

export function syncReaddir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (err: any) {
    const ignored = ignoreNotfound(err);
    if (ignored === null) return [];
    throw err;
  }
}

export function syncEnsuredir(dir: string) {
  if (existsSync(dir)) {
    return;
  }
  try {
    syncEnsuredir(dirname(dir));
  } catch (err: any) {
    ignoreExists(err);
  }
  try {
    mkdirSync(dir);
  } catch (err: any) {
    ignoreExists(err);
  }
}

export function syncReaddirRecursive(
  dir: string,
  ignore?: (p: string) => boolean,
  maxDepth?: number
): string[] {
  if (ignore && ignore(dir)) {
    return [];
  }
  const entries: Dirent[] = syncReaddir(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (maxDepth === undefined || maxDepth > 0) {
        const dirFiles = syncReaddirRecursive(
          entryPath,
          ignore,
          maxDepth === undefined ? undefined : maxDepth - 1
        );
        files.push(...dirFiles.map((f) => entry.name + "/" + f));
      }
    } else {
      if (!(ignore && ignore(entry.name))) {
        files.push(entry.name);
      }
    }
  }

  return files;
}

export function syncRmRecursive(dir: string) {
  const entries = syncReaddir(dir);
  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      syncRmRecursive(entryPath);
      rmdirSync(entryPath);
    } else {
      unlinkSync(entryPath);
    }
  }
}
