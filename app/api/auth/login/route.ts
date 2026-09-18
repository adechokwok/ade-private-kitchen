import { NextResponse } from "next/server";
import { CHEF_SESSION_COOKIE, createChefSession, isChefConfigured, sessionCookieOptions, verifyChefPassword } from "../../../chef-auth";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function safeReturnTo(value: FormDataEntryValue | null) {
  const path = String(value || "/chef");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/chef";
}

function clientKey(request: Request) {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  return request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim().slice(0, 80) || "direct";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const returnTo = safeReturnTo(form.get("returnTo"));
  const errorLocation = `/chef/login?error=1&returnTo=${encodeURIComponent(returnTo)}`;
  if (!isChefConfigured()) return new NextResponse(null, { status: 303, headers: { location: errorLocation } });

  const key = clientKey(request);
  const now = Date.now();
  for (const [id, record] of attempts) if (record.resetAt <= now) attempts.delete(id);
  const record = attempts.get(key);
  const globalRecord = attempts.get("global");
  if ((record && record.count >= MAX_ATTEMPTS) || (globalRecord && globalRecord.count >= 40)) {
    return new NextResponse(null, { status: 303, headers: { location: `/chef/login?error=locked&returnTo=${encodeURIComponent(returnTo)}` } });
  }
  if (!globalRecord) attempts.set("global", { count: 1, resetAt: now + WINDOW_MS });
  else globalRecord.count += 1;
  if (!record || record.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else record.count += 1;

  if (!verifyChefPassword(String(form.get("password") || ""))) return new NextResponse(null, { status: 303, headers: { location: errorLocation } });
  attempts.delete(key);
  const response = new NextResponse(null, { status: 303, headers: { location: returnTo } });
  response.cookies.set(CHEF_SESSION_COOKIE, createChefSession(), sessionCookieOptions(request));
  return response;
}
