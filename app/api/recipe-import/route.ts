import { env } from "cloudflare:workers";
import { chefApiGuard } from "../../chef-auth";

type IngredientType = "生鲜" | "蔬菜" | "调料" | "其他";

type RecipeDraft = {
  name: string;
  category: string;
  description: string;
  flavor: string;
  minutes: number;
  source: string;
  ingredients: Array<{ name: string; amount: number; unit: string; type: IngredientType }>;
  steps: string[];
  confidenceNotes: string[];
};

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ingredientTypes = new Set<IngredientType>(["生鲜", "蔬菜", "调料", "其他"]);
const sectionPattern = /^(食材清单|食材|配料|用料|烹饪步骤|制作步骤|做法|步骤|小贴士|提示)[:：]?$/;

function inferCategory(text: string) {
  if (/[虾蟹鱼贝海鲜鱿鱼]/.test(text)) return "海鲜";
  if (/[汤羹粥面粉米饭]/.test(text)) return "汤羹主食";
  if (/[鸡鸭鹅猪牛羊排骨肉]/.test(text)) return "家常热炒";
  if (/[辣椒花椒豆瓣湘川麻辣]/.test(text)) return "川湘小馆";
  return "家常菜";
}

function inferIngredientType(name: string): IngredientType {
  if (/[盐糖油酱醋酒粉椒香叶八角味精蚝油生抽老抽]/.test(name)) return "调料";
  if (/[葱姜蒜菜笋藕萝卜番茄土豆椒菇瓜豆芽]/.test(name)) return "蔬菜";
  if (/[肉鸡鸭鹅牛羊猪虾蟹鱼蛋排骨贝]/.test(name)) return "生鲜";
  return "其他";
}

function normalizeUnit(unit: string) {
  const map: Record<string, string> = { 克: "g", 千克: "kg", 毫升: "ml", 升: "L" };
  return map[unit] || unit;
}

function parseRecipeText(raw: string): RecipeDraft {
  const normalized = raw.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const sourceMatch = normalized.match(/【([^】]{1,30})】/);
  const titleLine = lines.find((line) => !sectionPattern.test(line) && !/^\d+[.、）)]/.test(line) && line.length <= 45) || "待命名菜谱";
  const name = titleLine.replace(/【[^】]+】/g, "").replace(/^(菜名|名称)[:：]\s*/, "").trim() || "待命名菜谱";

  const ingredientHeading = lines.findIndex((line) => /^(食材清单|食材|配料|用料)[:：]?$/.test(line));
  const stepHeading = lines.findIndex((line) => /^(烹饪步骤|制作步骤|做法|步骤)[:：]?$/.test(line));
  const ingredientSource = ingredientHeading >= 0
    ? lines.slice(ingredientHeading + 1, stepHeading > ingredientHeading ? stepHeading : undefined).join("、")
    : normalized;
  const ingredients: RecipeDraft["ingredients"] = [];
  const ingredientPattern = /([^、，,；;\n]{1,24}?)[\s:：]*(\d+(?:\.\d+)?)\s*(kg|千克|g|克|ml|毫升|L|升|个|只|片|根|颗|勺|汤匙|茶匙|碗|杯|把|块|条|斤)/gi;
  for (const match of ingredientSource.matchAll(ingredientPattern)) {
    const ingredientName = match[1].replace(/^(食材清单|食材|配料|用料)[:：]?/, "").trim();
    if (!ingredientName || ingredients.some((item) => item.name === ingredientName)) continue;
    ingredients.push({
      name: ingredientName,
      amount: Number(match[2]),
      unit: normalizeUnit(match[3]),
      type: inferIngredientType(ingredientName),
    });
  }

  const stepLines = (stepHeading >= 0 ? lines.slice(stepHeading + 1) : lines)
    .filter((line) => /^\d+[.、）)]\s*/.test(line) || /^【[^】]+】/.test(line))
    .map((line) => line.replace(/^\d+[.、）)]\s*/, "").trim())
    .filter((line) => line.length > 4);
  const description = lines.find((line) => line !== titleLine && !sectionPattern.test(line) && !/^\d+[.、）)]/.test(line) && line.length >= 12 && line.length <= 180) || "";

  return {
    name,
    category: inferCategory(normalized),
    description,
    flavor: /麻辣|香辣|辣椒|花椒/.test(normalized) ? "香辣" : "家常风味",
    minutes: 30,
    source: sourceMatch?.[1] || "文字智能录入",
    ingredients,
    steps: stepLines,
    confidenceNotes: ["当前使用文字解析模式，请重点核对食材用量和烹饪时间。"],
  };
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function normalizeDraft(value: unknown): RecipeDraft {
  const draft = (value && typeof value === "object" ? value : {}) as Partial<RecipeDraft>;
  const ingredients = Array.isArray(draft.ingredients) ? draft.ingredients.map((item) => ({
    name: typeof item?.name === "string" ? item.name.trim().slice(0, 40) : "",
    amount: Number(item?.amount),
    unit: typeof item?.unit === "string" ? item.unit.trim().slice(0, 12) : "",
    type: ingredientTypes.has(item?.type as IngredientType) ? item.type as IngredientType : "其他" as const,
  })).filter((item) => item.name && item.unit && Number.isFinite(item.amount) && item.amount > 0) : [];
  const steps = Array.isArray(draft.steps) ? draft.steps.filter((step): step is string => typeof step === "string").map((step) => step.trim().slice(0, 500)).filter(Boolean).slice(0, 30) : [];
  return {
    name: typeof draft.name === "string" ? draft.name.trim().slice(0, 40) : "待命名菜谱",
    category: typeof draft.category === "string" ? draft.category.trim().slice(0, 30) : "家常菜",
    description: typeof draft.description === "string" ? draft.description.trim().slice(0, 180) : "",
    flavor: typeof draft.flavor === "string" ? draft.flavor.trim().slice(0, 30) : "家常风味",
    minutes: Math.min(360, Math.max(5, Math.round(Number(draft.minutes) || 30))),
    source: typeof draft.source === "string" ? draft.source.trim().slice(0, 80) : "智能菜谱录入",
    ingredients,
    steps,
    confidenceNotes: Array.isArray(draft.confidenceNotes) ? draft.confidenceNotes.filter((note): note is string => typeof note === "string").map((note) => note.trim().slice(0, 120)).filter(Boolean).slice(0, 5) : [],
  };
}

function recipeSchema() {
  const ingredient = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" }, amount: { type: "number" }, unit: { type: "string" },
      type: { type: "string", enum: ["生鲜", "蔬菜", "调料", "其他"] },
    },
    required: ["name", "amount", "unit", "type"],
  };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" }, category: { type: "string" }, description: { type: "string" },
      flavor: { type: "string" }, minutes: { type: "number" }, source: { type: "string" },
      ingredients: { type: "array", items: ingredient },
      steps: { type: "array", items: { type: "string" } },
      confidenceNotes: { type: "array", items: { type: "string" } },
    },
    required: ["name", "category", "description", "flavor", "minutes", "source", "ingredients", "steps", "confidenceNotes"],
  };
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const text = String(form.get("text") || "").trim().slice(0, 16000);
    const images = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 4);
    if (!text && images.length === 0) return Response.json({ error: "请上传菜谱截图，或粘贴菜谱文字" }, { status: 400 });

    let totalBytes = 0;
    for (const image of images) {
      if (!acceptedImageTypes.has(image.type)) return Response.json({ error: "菜谱截图仅支持 JPG、PNG、WebP 或 GIF" }, { status: 400 });
      if (image.size > 6 * 1024 * 1024) return Response.json({ error: "每张截图请控制在 6MB 以内" }, { status: 400 });
      totalBytes += image.size;
    }
    if (totalBytes > 14 * 1024 * 1024) return Response.json({ error: "截图总大小请控制在 14MB 以内" }, { status: 400 });

    const runtime = env as unknown as { OPENAI_API_KEY?: string; OPENAI_RECIPE_MODEL?: string };
    if (!runtime.OPENAI_API_KEY) {
      if (text) return Response.json({ draft: parseRecipeText(text), mode: "text-fallback" });
      return Response.json({ error: "图片智能识别尚未配置。可以先粘贴菜谱文字进行自动拆解。", code: "AI_NOT_CONFIGURED" }, { status: 503 });
    }

    const content: Array<Record<string, unknown>> = [{
      type: "input_text",
      text: `请从菜谱截图或文字中提取一份结构化中文菜谱。忠实于原文，不要编造看不清的数据。\n\n规则：\n1. 多张截图可能是同一道菜的不同部分，请合并。\n2. 食材数量必须是数字；“适量”写 amount=1、unit="适量"。\n3. category 使用适合私人菜单的简短分类。\n4. source 填原作者、栏目或来源；无法判断则填“截图智能录入”。\n5. confidenceNotes 只列出需要主人复核的不确定信息。\n${text ? `\n用户补充文字：\n${text}` : ""}`,
    }];
    for (const image of images) {
      const base64 = toBase64(await image.arrayBuffer());
      content.push({ type: "input_image", image_url: `data:${image.type};base64,${base64}`, detail: "high" });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${runtime.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: runtime.OPENAI_RECIPE_MODEL || "gpt-5.4-mini",
        input: [{ role: "user", content }],
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "recipe_draft", strict: true, schema: recipeSchema() } },
      }),
    });
    const payload = await response.json() as {
      error?: { message?: string };
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    if (!response.ok) throw new Error(payload.error?.message || "图片识别服务暂时不可用");
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("没有识别出可用的菜谱内容");
    return Response.json({ draft: normalizeDraft(JSON.parse(outputText)), mode: "vision" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "菜谱识别失败，请稍后重试" }, { status: 500 });
  }
}
