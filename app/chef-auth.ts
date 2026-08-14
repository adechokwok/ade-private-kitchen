import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const CHEF_SESSION_COOKIE = "ade_chef_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type ChefSession = { sub: "chef"; exp: number };

function configuredPassword() {
  return process.env.CHEF_PASSWORD?.trim() || "";
}

export function isChefConfigured() {
  return configuredPassword().length >= 10;
}

export function verifyChefPassword(candidate: string) {
  const expected = configuredPassword();
  if (expected.length < 10 || candidate.length > 256) return false;
  const expectedDigest = createHmac("sha256", "ade-kitchen-password").update(expected).digest();
  const candidateDigest = createHmac("sha256", "ade-kitchen-password").update(candidate).digest();
  return timingSafeEqual(expectedDigest, candidateDigest);
}

function sessionSecret() {
  const configured = process.env.SESSION_SECRET?.trim();
  if (!configured || configured.length < 32) {
    throw new Error("CloudBase 云版需要配置长度至少 32 位的 SESSION_SECRET");
  }
  return configured;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createChefSession() {
  const payload: ChefSession = { sub: "chef", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyChefSession(value: string | undefined | null) {
  if (!value) return false;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) return false;
  const expected = Buffer.from(sign(encoded));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ChefSession>;
    return payload.sub === "chef" && typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function cookieFromRequest(request: Request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CHEF_SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function getChefSession() {
  return verifyChefSession((await cookies()).get(CHEF_SESSION_COOKIE)?.value);
}

export function chefApiGuard(request: Request): Response | null {
  if (!verifyChefSession(cookieFromRequest(request))) return Response.json({ error: "请先登录主厨工作台" }, { status: 401 });
  return null;
}

export function isChefRequest(request: Request) {
  return verifyChefSession(cookieFromRequest(request));
}

export function sessionCookieOptions(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const secure = forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: SESSION_TTL_SECONDS };
}
