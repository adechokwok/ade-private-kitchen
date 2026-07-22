import { and, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, getDb, getUploads } from "../../../db";
import { dinnerInvites, dinnerJournals, orders } from "../../../db/schema";
import { chefApiGuard } from "../../chef-auth";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const form = await request.formData();
  const requestedOrderId = String(form.get("orderId") || "");
  const requestedInviteId = String(form.get("inviteId") || "");
  const title = String(form.get("title") || "今晚的餐桌日记").trim().slice(0, 60);
  const note = String(form.get("note") || "").trim().slice(0, 800);
  const images = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 6);
  if (images.some((file) => !imageTypes.has(file.type) || file.size > 6 * 1024 * 1024)) return Response.json({ error: "照片需为常见图片格式，且每张不超过 6MB" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  let orderId = "";
  let inviteId = requestedInviteId;
  if (requestedOrderId) {
    const [order] = await getDb().select().from(orders).where(eq(orders.id, requestedOrderId)).limit(1);
    if (!order) return Response.json({ error: "没有找到这场饭局" }, { status: 404 });
    if (order.status !== "done") return Response.json({ error: "通知开饭后才能记录餐桌日记" }, { status: 409 });
    orderId = order.id;
    inviteId = order.inviteId;
  } else {
    const [invite] = await getDb().select().from(dinnerInvites).where(eq(dinnerInvites.id, inviteId)).limit(1);
    if (!invite) return Response.json({ error: "没有找到这场饭局" }, { status: 404 });
  }
  let existingRows = orderId ? await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.orderId, orderId)).limit(1) : [];
  if (!existingRows.length && inviteId) existingRows = await getDb().select().from(dinnerJournals).where(and(eq(dinnerJournals.inviteId, inviteId), eq(dinnerJournals.orderId, ""))).limit(1);
  const id = existingRows[0]?.id || crypto.randomUUID();
  let imageUrls: string[] = existingRows[0] ? (() => { try { return JSON.parse(existingRows[0].imageUrls); } catch { return []; } })() : [];
  if (images.length) {
    for (let index = 0; index < imageUrls.length; index += 1) await getUploads().delete(`dinner-journals/${id}/${index}`);
    imageUrls = [];
    for (const [index, file] of images.entries()) {
      await getUploads().put(`dinner-journals/${id}/${index}`, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
      imageUrls.push(`/api/journal-images/${id}/${index}`);
    }
  }
  const updatedAt = new Date().toISOString();
  const [journal] = existingRows[0]
    ? await getDb().update(dinnerJournals).set({ orderId, inviteId, title, note, imageUrls: JSON.stringify(imageUrls), updatedAt }).where(eq(dinnerJournals.id, id)).returning()
    : await getDb().insert(dinnerJournals).values({ id, orderId, inviteId, title, note, imageUrls: JSON.stringify(imageUrls), updatedAt }).returning();
  return Response.json({ journal: { ...journal, imageUrls } });
}

export async function DELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!id) return Response.json({ error: "缺少餐桌日记编号" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const [journal] = await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.id, id)).limit(1);
  if (!journal) return Response.json({ error: "没有找到这篇餐桌日记" }, { status: 404 });
  const imageUrls = (() => { try { return JSON.parse(journal.imageUrls) as string[]; } catch { return []; } })();
  for (let index = 0; index < imageUrls.length; index += 1) await getUploads().delete(`dinner-journals/${id}/${index}`);
  await getDb().delete(dinnerJournals).where(eq(dinnerJournals.id, id));
  return Response.json({ ok: true, id });
}
