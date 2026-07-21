import { chefApiGuard } from "../../chef-auth";

type CopyField = "description" | "slogan";
type ChatCompletionPayload = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
};

function baseUrl() {
  const configured = process.env.OPENAI_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("智能生成接口地址配置不正确");
  return configured.replace(/\/+$/, "");
}

function messageText(payload: ChatCompletionPayload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map((item) => item.text || "").join("") : "";
}

function parseObject(raw: string) {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean) as Record<string, unknown>; } catch { /* 兼容模型附带说明 */ }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("千问没有返回可用文案");
  return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as {
      field?: unknown;
      name?: unknown;
      flavor?: unknown;
      ingredients?: unknown;
      steps?: unknown;
      currentDescription?: unknown;
      currentSlogan?: unknown;
      preferences?: unknown;
    };
    const field = payload.field === "description" || payload.field === "slogan" ? payload.field as CopyField : null;
    const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 40) : "";
    if (!field || !name) return Response.json({ error: "请先填写菜名，再选择要生成的文案" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return Response.json({ error: "通义千问尚未配置，请在极空间中填写 OPENAI_API_KEY。" }, { status: 503 });
    const model = process.env.OPENAI_RECIPE_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "qwen3-vl-plus";
    const flavor = typeof payload.flavor === "string" ? payload.flavor.trim().slice(0, 40) : "";
    const ingredients = Array.isArray(payload.ingredients) ? payload.ingredients.slice(0, 30) : [];
    const steps = Array.isArray(payload.steps) ? payload.steps.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 300)).slice(0, 30) : [];
    const currentDescription = typeof payload.currentDescription === "string" ? payload.currentDescription.trim().slice(0, 180) : "";
    const currentSlogan = typeof payload.currentSlogan === "string" ? payload.currentSlogan.trim().slice(0, 60) : "";
    const preferences = typeof payload.preferences === "string" ? payload.preferences.trim().slice(0, 800) : "";
    const targetRule = field === "description"
      ? "生成 description：40–80 个中文字符，具体描述口感、香气、做法亮点和下饭/分享场景，不要堆砌形容词。"
      : "生成 slogan：8–18 个中文字符，像朋友点菜时看到的一句俏皮推荐语，顺口、有记忆点，不使用引号和句号。";
    const prompt = `你是私房菜单文案编辑。请根据真实菜谱重新创作指定字段，只返回 JSON，不要 Markdown。\n${targetRule}\n菜名：${name}\n口味：${flavor || "未填写"}\n食材：${JSON.stringify(ingredients)}\n步骤：${JSON.stringify(steps)}\n当前菜品介绍：${currentDescription || "无"}\n当前 slogan：${currentSlogan || "无"}\n${preferences ? `主厨习惯：${preferences}\n` : ""}不要照抄当前文案；内容必须与菜谱一致。返回格式：{\"${field}\":\"...\"}`;

    const response = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.65,
        max_tokens: 500,
        enable_thinking: false,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json() as ChatCompletionPayload;
    if (!response.ok) throw new Error(result.error?.message || "通义千问文案生成服务暂时不可用");
    const value = parseObject(messageText(result))[field];
    if (typeof value !== "string" || !value.trim()) throw new Error("千问没有返回可用文案");
    const limit = field === "description" ? 180 : 60;
    return Response.json({ [field]: value.trim().slice(0, limit), model });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "文案生成超过 1 分钟，请稍后重试"
      : error instanceof Error ? error.message : "文案生成失败，请稍后重试";
    return Response.json({ error: message }, { status: 500 });
  }
}
