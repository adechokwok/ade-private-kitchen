import { chefApiGuard } from "../../chef-auth";
import { conciseDescriptionRule, playfulSloganRule, privateKitchenCopyStyle } from "../recipe-copy-style";

type IngredientType = "生鲜" | "蔬菜" | "调料" | "其他";

type RecipeDraft = {
  name: string;
  category: string;
  description: string;
  slogan: string;
  flavor: string;
  minutes: number;
  source: string;
  ingredients: Array<{ name: string; amount: number; unit: string; type: IngredientType }>;
  steps: string[];
  confidenceNotes: string[];
  difficulty: "简单" | "适中" | "进阶";
  recipeSummary: string;
  missingChecks: string[];
  substitutions: Array<{ ingredient: string; alternatives: string[]; note: string }>;
  baseServings: number;
  seasons: string[];
  occasions: string[];
  dietary: string[];
};

type ChatCompletionPayload = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
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
    ingredients.push({ name: ingredientName, amount: Number(match[2]), unit: normalizeUnit(match[3]), type: inferIngredientType(ingredientName) });
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
    slogan: `${name}，今天就想吃这一口`.slice(0, 60),
    flavor: /麻辣|香辣|辣椒|花椒/.test(normalized) ? "香辣" : "家常风味",
    minutes: 30,
    source: sourceMatch?.[1] || "文字智能录入",
    ingredients,
    steps: stepLines,
    confidenceNotes: ["当前使用文字解析模式，请重点核对食材用量和烹饪时间。"],
    difficulty: "适中",
    recipeSummary: "已从文字拆成可编辑菜谱，请核对用量后保存。",
    missingChecks: ["复核食材用量与单位"],
    substitutions: [],
    baseServings: 4,
    seasons: [],
    occasions: [],
    dietary: [],
  };
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
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
    slogan: typeof draft.slogan === "string" ? draft.slogan.trim().replace(/[“”"。]$/g, "").slice(0, 60) : "",
    flavor: typeof draft.flavor === "string" ? draft.flavor.trim().slice(0, 30) : "家常风味",
    minutes: Math.min(360, Math.max(5, Math.round(Number(draft.minutes) || 30))),
    source: typeof draft.source === "string" ? draft.source.trim().slice(0, 80) : "截图智能录入",
    ingredients,
    steps,
    confidenceNotes: Array.isArray(draft.confidenceNotes) ? draft.confidenceNotes.filter((note): note is string => typeof note === "string").map((note) => note.trim().slice(0, 120)).filter(Boolean).slice(0, 5) : [],
    difficulty: draft.difficulty && ["简单", "适中", "进阶"].includes(draft.difficulty) ? draft.difficulty : "适中",
    recipeSummary: typeof draft.recipeSummary === "string" ? draft.recipeSummary.trim().slice(0, 240) : "",
    missingChecks: Array.isArray(draft.missingChecks) ? draft.missingChecks.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, 10) : [],
    substitutions: Array.isArray(draft.substitutions) ? draft.substitutions.map((item) => ({
      ingredient: typeof item?.ingredient === "string" ? item.ingredient.trim().slice(0, 40) : "",
      alternatives: Array.isArray(item?.alternatives) ? item.alternatives.filter((value): value is string => typeof value === "string").map((value) => value.trim().slice(0, 40)).filter(Boolean).slice(0, 5) : [],
      note: typeof item?.note === "string" ? item.note.trim().slice(0, 100) : "",
    })).filter((item) => item.ingredient && item.alternatives.length).slice(0, 12) : [],
    baseServings: Math.max(1, Math.min(20, Math.round(Number(draft.baseServings) || 4))),
    seasons: Array.isArray(draft.seasons) ? draft.seasons.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 20)).filter(Boolean).slice(0, 8) : [],
    occasions: Array.isArray(draft.occasions) ? draft.occasions.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 20)).filter(Boolean).slice(0, 8) : [],
    dietary: Array.isArray(draft.dietary) ? draft.dietary.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 20)).filter(Boolean).slice(0, 8) : [],
  };
}

function parseJsonObject(raw: string) {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(withoutFence); } catch { /* 部分兼容接口会在 JSON 前后加说明 */ }
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("识别结果不是有效菜谱，请重新拍清楚后再试");
  return JSON.parse(withoutFence.slice(start, end + 1));
}

function chatMessageText(payload: ChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item.text || "").join("");
  return "";
}

function compatibleBaseUrl() {
  const configured = process.env.OPENAI_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("智能识别接口地址配置不正确");
  return configured.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const text = String(form.get("text") || "").trim().slice(0, 16000);
    const preferences = String(form.get("preferences") || "").trim().slice(0, 1600);
    const images = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 4);
    const rotations = (() => {
      try {
        const value = JSON.parse(String(form.get("rotations") || "[]"));
        return Array.isArray(value) ? value.map((item) => [0, 90, 180, 270].includes(Number(item)) ? Number(item) : 0).slice(0, 4) : [];
      } catch { return []; }
    })();
    if (!text && images.length === 0) return Response.json({ error: "请上传菜谱截图，或粘贴菜谱文字" }, { status: 400 });

    let totalBytes = 0;
    for (const image of images) {
      if (!acceptedImageTypes.has(image.type)) return Response.json({ error: "菜谱截图仅支持 JPG、PNG、WebP 或 GIF" }, { status: 400 });
      if (image.size > 6 * 1024 * 1024) return Response.json({ error: "每张截图请控制在 6MB 以内" }, { status: 400 });
      totalBytes += image.size;
    }
    if (totalBytes > 14 * 1024 * 1024) return Response.json({ error: "截图总大小请控制在 14MB 以内" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const recipeModel = process.env.OPENAI_RECIPE_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "qwen3-vl-plus";
    if (!apiKey) {
      if (text) return Response.json({ draft: parseRecipeText(text), mode: "text-fallback", model: "本地文字解析" });
      return Response.json({ error: "通义千问图片识别尚未配置。请在极空间中填写 OPENAI_API_KEY。", code: "AI_NOT_CONFIGURED" }, { status: 503 });
    }

    const orientationHint = images.length
      ? rotations.map((rotation, index) => `第 ${index + 1} 张${rotation ? `请先顺时针旋转 ${rotation}°` : "方向无需调整"}`).join("；")
      : "";
    const prompt = `你是家庭主厨的菜谱整理助手。请仔细阅读所有图片（包括横拍、竖拍、书页跨页和带步骤小图的照片），把同一道菜合并成一份完整菜谱，并只返回一个 JSON 对象，不要使用 Markdown。

必须忠实抄录图片中能看清的内容，不得凭空补写原文没有的精确用量。图片中如果有“材料、步骤、诀窍、提示”等栏目，要完整归入对应字段。步骤按实际先后顺序写清动作、火候、时间和判断标准。

JSON 字段必须包含：name、category、description、slogan、flavor、minutes、source、ingredients、steps、confidenceNotes、difficulty、recipeSummary、missingChecks、substitutions、baseServings、seasons、occasions、dietary。
${conciseDescriptionRule}
${playfulSloganRule}
两项文案都必须遵守系统提供的“阿德小厨房”风格；description 不要写成做法摘要，slogan 不要使用菜名、引号、句号或感叹号。
ingredients 每项包含 name、amount、unit、type；type 只能是“生鲜、蔬菜、调料、其他”。数量必须是数字；原文写“适量”时使用 amount=1、unit="适量"。看不清的内容放到 confidenceNotes；原文确实没有但下厨前需要确认的内容放到 missingChecks。difficulty 只能是“简单、适中、进阶”。无法判断份量时 baseServings=4。

图片方向提示：${orientationHint || "无图片"}。
${preferences ? `\n主厨习惯（仅在不违背原菜谱时参考）：\n${preferences}` : ""}
${text ? `\n用户补充文字：\n${text}` : ""}`;
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
    for (const image of images) {
      content.push({ type: "image_url", image_url: { url: `data:${image.type};base64,${toBase64(await image.arrayBuffer())}` } });
    }

    const response = await fetch(`${compatibleBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: recipeModel,
        messages: [{ role: "system", content: privateKitchenCopyStyle }, { role: "user", content }],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 8000,
        enable_thinking: false,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const payload = await response.json() as ChatCompletionPayload;
    if (!response.ok) throw new Error(payload.error?.message || "通义千问图片识别服务暂时不可用");
    const outputText = chatMessageText(payload);
    if (!outputText) throw new Error("通义千问没有返回可用的菜谱内容");
    return Response.json({ draft: normalizeDraft(parseJsonObject(outputText)), mode: "qwen-vision", model: recipeModel });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "图片识别超过 2 分钟，请减少截图数量或压缩图片后重试"
      : error instanceof Error ? error.message : "菜谱识别失败，请稍后重试";
    return Response.json({ error: message }, { status: 500 });
  }
}
