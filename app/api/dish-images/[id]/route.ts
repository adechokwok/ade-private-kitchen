import { getUploads } from "../../../../db";
import sharp from "sharp";

const thumbnailCache = new Map<string, Buffer>();
const thumbnailCacheLimit = 96;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
    const object = await getUploads().get(`dish-images/${id}`);
    if (!object) return new Response("Not found", { status: 404 });
    const thumbnail = new URL(request.url).searchParams.get("size") === "thumb";
    if (thumbnail) {
      const cacheKey = object.httpEtag;
      let bytes = thumbnailCache.get(cacheKey);
      if (!bytes) {
        bytes = await sharp(object.body).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 76, effort: 3 }).toBuffer();
        thumbnailCache.set(cacheKey, bytes);
        if (thumbnailCache.size > thumbnailCacheLimit) thumbnailCache.delete(thumbnailCache.keys().next().value || cacheKey);
      }
      const headers = new Headers({
        "content-type": "image/webp",
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
        "etag": `${object.httpEtag}-thumb`,
        "x-content-type-options": "nosniff",
      });
      return new Response(new Uint8Array(bytes), { headers });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, no-cache, max-age=0, must-revalidate");
    headers.set("x-content-type-options", "nosniff");
    if (request.headers.get("if-none-match") === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(new Uint8Array(object.body), { headers });
  } catch {
    return new Response("Image unavailable", { status: 503 });
  }
}
