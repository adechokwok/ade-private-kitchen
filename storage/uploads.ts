import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import COS from "cos-nodejs-sdk-v5";
import { ensureDataDirectories, getUploadsDir } from "./paths";

type UploadMetadata = { contentType?: string; cacheControl?: string };
type PutOptions = { httpMetadata?: UploadMetadata };
type UploadBody = ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array;

export function safePath(key: string) {
  if (!key || key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("无效的图片路径");
  const root = getUploadsDir();
  const filePath = path.resolve(root, key);
  if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("无效的图片路径");
  return filePath;
}

function metadataPath(filePath: string) {
  return `${filePath}.meta.json`;
}

async function streamToBuffer(body: UploadBody) {
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

async function nodeStreamToBuffer(body: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | string>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

class LocalUploadStore {
  async put(key: string, body: UploadBody, options: PutOptions = {}) {
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

  async list(prefix = "") {
    const root = path.resolve(getUploadsDir(), prefix);
    const output: string[] = [];
    const walk = async (directory: string, relative: string): Promise<void> => {
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      for (const entry of entries) {
        const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name), nextRelative);
        else if (entry.isFile() && !entry.name.endsWith(".meta.json")) output.push(nextRelative);
      }
    };
    await walk(root, "");
    return output;
  }

  async delete(key: string) {
    const filePath = safePath(key);
    await Promise.all([rm(filePath, { force: true }), rm(metadataPath(filePath), { force: true })]);
  }
}

class CosUploadStore {
  private readonly client: COS;
  private readonly bucket: string;
  private readonly region: string;

  constructor() {
    const SecretId = process.env.COS_SECRET_ID?.trim();
    const SecretKey = process.env.COS_SECRET_KEY?.trim();
    this.bucket = process.env.COS_BUCKET?.trim() || "";
    this.region = process.env.COS_REGION?.trim() || "";
    if (!SecretId || !SecretKey || !this.bucket || !this.region) {
      throw new Error("COS 存储需要配置 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION");
    }
    this.client = new COS({ SecretId, SecretKey });
  }

  private request<T>(method: "putObject" | "getObject" | "deleteObject" | "getBucket", params: Record<string, unknown>) {
    return new Promise<T>((resolve, reject) => {
      (this.client[method] as unknown as (input: Record<string, unknown>, callback: (error: Error | null, data: T) => void) => void)(params, (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });
  }

  async put(key: string, body: UploadBody, options: PutOptions = {}) {
    const metadata = options.httpMetadata || {};
    await this.request("putObject", {
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: await streamToBuffer(body),
      ContentType: metadata.contentType,
      CacheControl: metadata.cacheControl,
    });
  }

  async get(key: string) {
    type CosObject = { Body?: Buffer | string | NodeJS.ReadableStream; Headers?: Record<string, string>; ETag?: string };
    try {
      const result = await this.request<CosObject>("getObject", { Bucket: this.bucket, Region: this.region, Key: key });
      const body = Buffer.isBuffer(result.Body)
        ? result.Body
        : typeof result.Body === "string"
          ? Buffer.from(result.Body)
          : result.Body
            ? await nodeStreamToBuffer(result.Body)
            : Buffer.alloc(0);
      const headers = result.Headers || {};
      return {
        body,
        httpEtag: result.ETag || `"${createHash("sha256").update(body).digest("hex")}"`,
        writeHttpMetadata(target: Headers) {
          if (headers["content-type"]) target.set("content-type", headers["content-type"]);
          if (headers["cache-control"]) target.set("cache-control", headers["cache-control"]);
        },
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "NoSuchKey" || code === "NotFound" || code === "NoSuchResource") return null;
      throw error;
    }
  }

  async list(prefix = "") {
    type CosList = { Contents?: Array<{ Key?: string }>; IsTruncated?: boolean; NextMarker?: string };
    const keys: string[] = [];
    let marker = "";
    do {
      const result = await this.request<CosList>("getBucket", { Bucket: this.bucket, Region: this.region, Prefix: prefix, Marker: marker, MaxKeys: "1000" });
      for (const item of result.Contents || []) if (item.Key) keys.push(item.Key);
      marker = result.IsTruncated ? (result.NextMarker || "") : "";
    } while (marker);
    return keys;
  }

  async delete(key: string) {
    await this.request("deleteObject", { Bucket: this.bucket, Region: this.region, Key: key });
  }
}

const runtime = globalThis as typeof globalThis & { __adeUploads?: LocalUploadStore | CosUploadStore };

export function getUploads() {
  const useCos = process.env.STORAGE_DRIVER?.trim().toLowerCase() === "cos";
  if (useCos) {
    if (!(runtime.__adeUploads instanceof CosUploadStore)) runtime.__adeUploads = new CosUploadStore();
  } else if (!(runtime.__adeUploads instanceof LocalUploadStore)) {
    runtime.__adeUploads = new LocalUploadStore();
  }
  return runtime.__adeUploads;
}
