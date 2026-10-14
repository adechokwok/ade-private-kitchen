export type MenuFontKind = "system" | "builtin" | "custom";

export const MENU_FONT_ID_PATTERN = /^(system-serif|zcool-xiaowei|zcool-kuaile|long-cang|zhi-mang-xing|ma-shan-zheng|liu-jian-mao-cao|custom-[a-f0-9-]{36})$/;
export function isMenuFontId(value: unknown): value is string {
  return typeof value === "string" && MENU_FONT_ID_PATTERN.test(value);
}

export type MenuFont = {
  id: string;
  name: string;
  style: string;
  kind: MenuFontKind;
  fileUrl?: string;
  format?: "truetype" | "opentype" | "woff" | "woff2";
};

export const SYSTEM_MENU_FONT: MenuFont = {
  id: "system-serif",
  name: "系统宋体",
  style: "清晰稳重 · 通用",
  kind: "system",
};

export const BUILTIN_MENU_FONTS: Array<MenuFont & { fileName: string; format: MenuFont["format"] }> = [
  { id: "zcool-xiaowei", name: "站酷小薇", style: "秀气手写 · 易读推荐", kind: "builtin", fileName: "ZCOOLXiaoWei-Regular.ttf", format: "truetype" },
  { id: "zcool-kuaile", name: "站酷快乐体", style: "圆润轻松 · 明快", kind: "builtin", fileName: "ZCOOLKuaiLe-Regular.ttf", format: "truetype" },
  { id: "long-cang", name: "龙藏体", style: "舒展手写 · 标题感", kind: "builtin", fileName: "LongCang-Regular.ttf", format: "truetype" },
  { id: "zhi-mang-xing", name: "钟齐志莽行书", style: "浓墨行书 · 适合短句", kind: "builtin", fileName: "ZhiMangXing-Regular.ttf", format: "truetype" },
  { id: "ma-shan-zheng", name: "马善政毛笔楷书", style: "传统书写 · 有笔意", kind: "builtin", fileName: "MaShanZheng-Regular.ttf", format: "truetype" },
  { id: "liu-jian-mao-cao", name: "刘建毛草", style: "奔放草书 · 装饰感", kind: "builtin", fileName: "LiuJianMaoCao-Regular.ttf", format: "truetype" },
];

export const TEMPLATE_DEFAULT_FONTS: Record<string, string> = {
  home: "zcool-xiaowei",
  romance: "long-cang",
  fine: "system-serif",
  spring: "zcool-xiaowei",
  midautumn: "ma-shan-zheng",
  birthday: "zcool-kuaile",
  housewarming: "zcool-xiaowei",
  summer: "long-cang",
  christmas: "zcool-xiaowei",
  brunch: "zcool-kuaile",
  jiangnan: "zhi-mang-xing",
  hotpot: "zcool-kuaile",
  "birthday-party": "zcool-kuaile",
  "archive-ledger": "ma-shan-zheng",
  "xuan-paper": "zhi-mang-xing",
  "ingredient-atlas": "system-serif",
  "antique-post": "ma-shan-zheng",
  "bistro-handwritten": "long-cang",
};

export function menuFontFamily(id: string) {
  return id === "system-serif" ? '"Noto Serif SC", "Songti SC", "STSong", serif' : `"AdeMenuFont-${id}", "Noto Serif SC", "Songti SC", serif`;
}

export function menuFontCss(fonts: MenuFont[]) {
  return fonts.filter((font) => font.fileUrl && font.format).map((font) => {
    const safeId = /^[a-z0-9-]+$/.test(font.id) ? font.id : "system-serif";
    const family = `AdeMenuFont-${safeId}`;
    return `@font-face{font-family:"${family}";src:url("${font.fileUrl}") format("${font.format}");font-style:normal;font-weight:400;font-display:swap}.menu-font-${safeId}{--menu-font-family:"${family}","Noto Serif SC","Songti SC",serif}`;
  }).join("\n");
}
