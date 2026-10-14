import { findMenuFont, loadMenuFontFile } from "../../../../menu-fonts";
import { isMenuFontId } from "../../../../menu-fonts-shared";

export const runtime = "nodejs";

const contentTypes = { truetype: "font/ttf", opentype: "font/otf", woff: "font/woff", woff2: "font/woff2" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMenuFontId(id) || id === "system-serif") return new Response("Not found", { status: 404 });
  try {
    const font = await findMenuFont(id);
    if (!font?.format) return new Response("Not found", { status: 404 });
    const bytes = await loadMenuFontFile(font);
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { "content-type": contentTypes[font.format], "cache-control": "public, max-age=300", "x-content-type-options": "nosniff", "content-length": String(bytes.byteLength) } });
  } catch { return new Response("Not found", { status: 404 }); }
}
