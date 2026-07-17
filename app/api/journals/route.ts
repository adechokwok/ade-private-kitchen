import { eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, getDb, getUploads } from "../../../db";
import { dinnerInvites, dinnerJournals } from "../../../db/schema";
import { chefApiGuard } from "../../chef-auth";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const form = await request.formData();
  const inviteId = String(form.get("inviteId") || "");
  const title = String(form.get("title") || "今晚的餐桌日记").trim().slice(0, 60);
  const note = String(form.get("note") || "").trim().slice(0, 800);
  const images = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 6);
  if (images.some((file) => !imageTypes.has(file.type) || file.size > 6 * 1024 * 1024)) return Response.json({ error: "照片需为常见图片格式，且每张不超过 6MB" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const [invite] = await getDb().select().from(dinnerInvites).where(eq(dinnerInvites.id, inviteId)).limit(1);
  if (!invite) return Response.json({ error: "没有找到这场饭局" }, { status: 404 });
  const existingRows = await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.inviteId, inviteId)).limit(1);
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
  const [journal] = existingRows[0]
    ? await getDb().update(dinnerJournals).set({ title, note, imageUrls: JSON.stringify(imageUrls) }).where(eq(dinnerJournals.id, id)).returning()
    : await getDb().insert(dinnerJournals).values({ id, inviteId, title, note, imageUrls: JSON.stringify(imageUrls) }).returning();
  return Response.json({ journal: { ...journal, imageUrls } });
}
