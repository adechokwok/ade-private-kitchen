import { withDataWrite } from "../../../../storage/maintenance";
import { chefApiGuard } from "../../../chef-auth";
import { removeMenuFont } from "../../../menu-fonts";
import { isMenuFontId } from "../../../menu-fonts-shared";

async function handleDELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!isMenuFontId(id)) return Response.json({ error: "字体编号无效" }, { status: 400 });
    return Response.json({ fonts: await removeMenuFont(id) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "移除字体失败" }, { status: 400 }); }
}

export async function DELETE(...args: Parameters<typeof handleDELETE>) { return withDataWrite(() => handleDELETE(...args)); }
