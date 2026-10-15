import { withDataWrite } from "../../../storage/maintenance";
import { chefApiGuard } from "../../chef-auth";
import { addMenuFonts, listMenuFonts, restoreBuiltInMenuFonts } from "../../menu-fonts";

export const runtime = "nodejs";

export async function GET() {
  try { return Response.json({ fonts: await listMenuFonts() }, { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "字体库暂时无法读取" }, { status: 500 }); }
}

async function handlePOST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    return Response.json({ fonts: await addMenuFonts(files) }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "字体导入失败" }, { status: 400 }); }
}

export async function POST(request: Request) { return withDataWrite(() => handlePOST(request)); }

async function handlePATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (body?.action !== "restore-builtins") return Response.json({ error: "操作无效" }, { status: 400 });
    return Response.json({ fonts: await restoreBuiltInMenuFonts() });
  } catch { return Response.json({ error: "恢复内置字体失败" }, { status: 400 }); }
}

export async function PATCH(request: Request) { return withDataWrite(() => handlePATCH(request)); }
