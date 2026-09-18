import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chefApiGuard } from "../../chef-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maximumImageBytes = 8 * 1024 * 1024;

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (isIP(ipv4) !== 4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

async function assertPublicImageUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("图片地址格式不正确"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("图片地址需要以 http:// 或 https:// 开头");
  if (url.username || url.password) throw new Error("图片地址不能包含账号或密码");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("不能读取本机或局域网图片地址");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("不能读取本机或局域网图片地址");
  return url;
}

async function fetchRemoteImage(initialUrl: URL) {
  let currentUrl = initialUrl;
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1", "user-agent": "AdePrivateKitchen/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("图片地址发生了无效跳转");
      currentUrl = await assertPublicImageUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`图片服务器返回 ${response.status}`);
    const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!allowedImageTypes.has(contentType)) throw new Error("这个地址返回的不是支持的图片格式");
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maximumImageBytes) throw new Error("网络图片不能超过 8MB");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumImageBytes) {
        await reader.cancel();
        throw new Error("网络图片不能超过 8MB");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => { body.set(chunk, offset); offset += chunk.byteLength; });
    return { body, contentType };
  }
  throw new Error("图片地址跳转次数过多");
}

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const value = new URL(request.url).searchParams.get("url")?.trim() || "";
    if (!value) return Response.json({ error: "请粘贴网络图片地址" }, { status: 400 });
    const url = await assertPublicImageUrl(value);
    const { body, contentType } = await fetchRemoteImage(url);
    return new Response(body, { headers: { "content-type": contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "网络图片读取失败" }, { status: 400 });
  }
}
