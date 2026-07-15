import { env } from "cloudflare:workers";

const EMAIL_HEADER = "oai-authenticated-user-email";

export function configuredChefEmail() {
  const runtime = env as unknown as { CHEF_EMAIL?: string };
  return runtime.CHEF_EMAIL?.trim().toLowerCase() || "";
}

export function chefApiGuard(request: Request): Response | null {
  const configured = configuredChefEmail();
  const current = request.headers.get(EMAIL_HEADER)?.trim().toLowerCase() || "";
  if (!current) return Response.json({ error: "请先登录主厨工作台" }, { status: 401 });
  if (!configured || current !== configured) return Response.json({ error: "这个工作台只向主厨本人开放" }, { status: 403 });
  return null;
}

export function isChefRequest(request: Request) {
  const configured = configuredChefEmail();
  const current = request.headers.get(EMAIL_HEADER)?.trim().toLowerCase() || "";
  return Boolean(configured && current === configured);
}
