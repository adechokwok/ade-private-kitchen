import { getUploads } from "../../../../../db";

export async function GET(_request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await context.params;
  if (!/^[a-zA-Z0-9-]+$/.test(id) || !/^\d+$/.test(index)) return new Response("Invalid image", { status: 400 });
  try {
    const object = await getUploads().get(`dish-gallery/${id}/${index}`);
    if (!object) return new Response("Image not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Image unavailable", { status: 503 });
  }
}
