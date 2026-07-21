import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDataDirectories, getUploadsDir } from "./paths";

type UploadMetadata = { contentType?: string; cacheControl?: string };
type PutOptions = { httpMetadata?: UploadMetadata };

function safePath(key: string) {
  if (!key || key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("无效的图片路径");
  const root = getUploadsDir();
  const filePath = path.resolve(root, key);
  if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("无效的图片路径");
  return filePath;
}

function metadataPath(filePath: string) {
  return `${filePath}.meta.json`;
}

async function streamToBuffer(body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array) {
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

class LocalUploadStore {
  async put(key: string, body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array, options: PutOptions = {}) {
    ensureDataDirectories();
    const filePath = safePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const bytes = await streamToBuffer(body);
    const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o640 });
    await rename(temporary, filePath);
    await writeFile(metadataPath(filePath), JSON.stringify(options.httpMetadata || {}), { mode: 0o640 });
  }

  async get(key: string) {
    const filePath = safePath(key);
    try {
      const body = await readFile(filePath);
      let metadata: UploadMetadata = {};
      try { metadata = JSON.parse(await readFile(metadataPath(filePath), "utf8")) as UploadMetadata; } catch { /* 兼容旧图片 */ }
      const httpEtag = `"${createHash("sha256").update(body).digest("hex")}"`;
      return {
        body,
        httpEtag,
        writeHttpMetadata(headers: Headers) {
          if (metadata.contentType) headers.set("content-type", metadata.contentType);
          if (metadata.cacheControl) headers.set("cache-control", metadata.cacheControl);
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string) {
    const filePath = safePath(key);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(metadataPath(filePath), { force: true }),
    ]);
  }
}

const runtime = globalThis as typeof globalThis & { __adeUploads?: LocalUploadStore };

export function getUploads() {
  runtime.__adeUploads ??= new LocalUploadStore();
  return runtime.__adeUploads;
}
