import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDataDirectories, getUploadsDir } from "./paths";

type UploadMetadata = { contentType?: string; cacheControl?: string };
type PutOptions = { httpMetadata?: UploadMetadata };
type UploadBody = ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array;

export function safePath(key: string) {
  if (!key || key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("无效的图片路径");
  }
  const root = getUploadsDir();
  const filePath = path.resolve(root, key);
  if (!filePath.startsWith(root + path.sep)) throw new Error("无效的图片路径");
  return filePath;
}

function metadataPath(filePath: string) {
  return filePath + ".meta.json";
}

async function streamToBuffer(body: UploadBody) {
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

class FuseUploadStore {
  async put(key: string, body: UploadBody, options: PutOptions = {}) {
    ensureDataDirectories();
    const filePath = safePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const bytes = await streamToBuffer(body);
    // COS/FUSE is object-backed; do not depend on atomic rename semantics.
    await writeFile(filePath, bytes);
    await writeFile(metadataPath(filePath), JSON.stringify(options.httpMetadata || {}));
  }

  async get(key: string) {
    const filePath = safePath(key);
    try {
      const body = await readFile(filePath);
      let metadata: UploadMetadata = {};
      try {
        metadata = JSON.parse(await readFile(metadataPath(filePath), "utf8")) as UploadMetadata;
      } catch {
        // Older uploads may not have a metadata sidecar.
      }
      const httpEtag = "\"" + createHash("sha256").update(body).digest("hex") + "\"";
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

  async list(prefix = "") {
    const root = path.resolve(getUploadsDir(), prefix);
    const output: string[] = [];
    const walk = async (directory: string, relative: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        const nextRelative = relative ? relative + "/" + entry.name : entry.name;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), nextRelative);
        else if (entry.isFile() && !entry.name.endsWith(".meta.json")) output.push(nextRelative);
      }
    };
    await walk(root, "");
    return output;
  }

  async delete(key: string) {
    const filePath = safePath(key);
    await Promise.all([
      rm(filePath, { force: true }),
      rm(metadataPath(filePath), { force: true }),
    ]);
  }
}

const runtime = globalThis as typeof globalThis & { __adeUploads?: FuseUploadStore };

export function getUploads() {
  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (driver !== "fuse") {
    throw new Error("CloudBase 云版必须设置 STORAGE_DRIVER=fuse，并将 COS/FUSE 挂载到 /data");
  }
  runtime.__adeUploads ??= new FuseUploadStore();
  return runtime.__adeUploads;
}
