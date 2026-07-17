import { getUploads } from "../../../../../db";

export async function GET(_request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d$/.test(index)) return new Response("Not found", { status: 404 });
  const object = await getUploads().get(`dinner-journals/${id}/${index}`);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control", "public, max-age=31536000, immutable"); headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
