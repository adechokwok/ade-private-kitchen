import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ensureMenuLibrary, getDb } from "../db";
import { appSettings } from "../db/schema";
import { getDataDir } from "../storage/paths";
import { BUILTIN_MENU_FONTS, SYSTEM_MENU_FONT, type MenuFont } from "./menu-fonts-shared";

const settingKey = "menu_font_library_v1";
const maxFontBytes = 12 * 1024 * 1024;
const maxFontsPerUpload = 12;
type FontSettings = { disabledBuiltins: string[]; customFonts: MenuFont[] };

function fontsDirectory() { return path.join(getDataDir(), "menu-fonts"); }
function customPath(font: MenuFont) { return path.join(fontsDirectory(), `${font.id}.${extensionForFormat(font.format)}`); }
function extensionForFormat(format: MenuFont["format"]) {
  return format === "truetype" ? "ttf" : format === "opentype" ? "otf" : format || "woff2";
}

async function settings(): Promise<FontSettings> {
  await ensureMenuLibrary();
  const row = getDb().select().from(appSettings).where(eq(appSettings.key, settingKey)).get();
  if (!row) return { disabledBuiltins: [], customFonts: [] };
  try {
    const parsed = JSON.parse(row.value) as Partial<FontSettings>;
    return {
      disabledBuiltins: Array.isArray(parsed.disabledBuiltins) ? parsed.disabledBuiltins.filter((id): id is string => typeof id === "string") : [],
      customFonts: Array.isArray(parsed.customFonts) ? parsed.customFonts.filter((font): font is MenuFont => Boolean(font && typeof font.id === "string" && font.kind === "custom" && typeof font.name === "string" && typeof font.format === "string")) : [],
    };
  } catch { return { disabledBuiltins: [], customFonts: [] }; }
}

async function saveSettings(value: FontSettings) {
  await ensureMenuLibrary();
  const serialized = JSON.stringify(value);
  getDb().insert(appSettings).values({ key: settingKey, value: serialized }).onConflictDoUpdate({ target: appSettings.key, set: { value: serialized } }).run();
}

export async function listMenuFonts(): Promise<MenuFont[]> {
  const stored = await settings();
  const activeBuiltins = BUILTIN_MENU_FONTS.filter((font) => !stored.disabledBuiltins.includes(font.id));
  return [SYSTEM_MENU_FONT, ...activeBuiltins.map(({ id, name, style, kind, format }) => ({ id, name, style, kind, format, fileUrl: `/api/menu-fonts/${id}/file` })), ...stored.customFonts.map((font) => ({ ...font, fileUrl: `/api/menu-fonts/${font.id}/file` }))];
}

export async function findMenuFont(id: string) {
  const fonts = await listMenuFonts();
  return fonts.find((font) => font.id === id) || null;
}

export async function loadMenuFontFile(font: MenuFont) {
  if (font.kind === "builtin") {
    const builtIn = BUILTIN_MENU_FONTS.find((item) => item.id === font.id);
    if (!builtIn) return null;
    return readFile(path.join(process.cwd(), "public", "fonts", builtIn.fileName));
  }
  if (font.kind === "custom") return readFile(customPath(font));
  return null;
}

function sanitizedDisplayName(name: string) {
  return path.basename(name).replace(/\.[^.]+$/, "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) || "本地字体";
}

function detectFormat(bytes: Uint8Array): MenuFont["format"] | null {
  const signature = Buffer.from(bytes.subarray(0, 4)).toString("latin1");
  if (signature === "\u0000\u0001\u0000\u0000" || signature === "true") return "truetype";
  if (signature === "OTTO") return "opentype";
  if (signature === "wOFF") return "woff";
  if (signature === "wOF2") return "woff2";
  return null;
}

export async function addMenuFonts(files: File[]) {
  if (!files.length || files.length > maxFontsPerUpload) throw new Error(`一次请选择 1–${maxFontsPerUpload} 个字体文件`);
  const inputs: Array<{ file: File; bytes: Buffer; format: NonNullable<MenuFont["format"]>; name: string }> = [];
  let total = 0;
  for (const file of files) {
    if (file.size <= 0 || file.size > maxFontBytes) throw new Error(`${file.name} 超出限制，单个字体需小于 12 MB`);
    total += file.size;
    if (total > 48 * 1024 * 1024) throw new Error("本次导入的字体总量不能超过 48 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    const format = detectFormat(bytes);
    if (!format) throw new Error(`${file.name} 不是可识别的 TTF、OTF、WOFF 或 WOFF2 字体文件`);
    inputs.push({ file, bytes, format, name: sanitizedDisplayName(file.name) });
  }

  const current = await settings();
  const nextFonts = [...current.customFonts];
  const written: string[] = [];
  try {
    await mkdir(fontsDirectory(), { recursive: true });
    for (const input of inputs) {
      const id = `custom-${randomUUID()}`;
      const font: MenuFont = { id, name: input.name, style: "本地导入", kind: "custom", format: input.format };
      const target = customPath(font);
      const staging = `${target}.uploading`;
      await writeFile(staging, input.bytes, { flag: "wx", mode: 0o640 });
      await rename(staging, target);
      written.push(target);
      nextFonts.push(font);
    }
    await saveSettings({ ...current, customFonts: nextFonts });
    return listMenuFonts();
  } catch (error) {
    await Promise.all(written.map((file) => rm(file, { force: true })));
    throw error;
  }
}

export async function removeMenuFont(id: string) {
  const current = await settings();
  if (id === SYSTEM_MENU_FONT.id) throw new Error("系统宋体不可移除");
  if (BUILTIN_MENU_FONTS.some((font) => font.id === id)) {
    await saveSettings({ ...current, disabledBuiltins: Array.from(new Set([...current.disabledBuiltins, id])) });
    return listMenuFonts();
  }
  const custom = current.customFonts.find((font) => font.id === id);
  if (!custom) throw new Error("找不到这款字体");
  await rm(customPath(custom), { force: true });
  await saveSettings({ ...current, customFonts: current.customFonts.filter((font) => font.id !== id) });
  return listMenuFonts();
}

export async function restoreBuiltInMenuFonts() {
  const current = await settings();
  await saveSettings({ ...current, disabledBuiltins: [] });
  return listMenuFonts();
}
