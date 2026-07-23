import { getUploads } from "../../../../db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
    const object = await getUploads().get(`dish-images/${id}`);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, no-cache, max-age=0, must-revalidate");
    headers.set("x-content-type-options", "nosniff");
    if (request.headers.get("if-none-match") === object.httpEtag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(object.body, { headers });
  } catch {
    return new Response("Image unavailable", { status: 503 });
  }
}
