/** Calendar dates for the kitchen, independent of the server's timezone. */
export function kitchenDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function validMealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function courseForRecipe(dish?: { name: string; category: string }): "starter" | "main" | "staple" | "soup" {
  const category = dish?.category || "";
  const name = dish?.name || "";
  if (/汤$|羹$|糖水|布丁|冰淇淋/.test(name)) return "soup";
  if (/炒饭$|焖饭$|炒面$|拌面$|汤面$|粥$|馒头$|饺子$|包子$/.test(name)) return "staple";
  if (/^(凉拌|凉菜)|沙拉$/.test(name)) return "starter";
  if (/主食|米饭|面食|粥|饼|包点/.test(category)) return "staple";
  if (/汤|羹|饮品|甜品|糖水/.test(category)) return "soup";
  if (/凉菜|冷盘|沙拉|前菜|卤味/.test(category)) return "starter";
  return "main";
}

/** Never truncate demand identities: different dinners must never share a check. */
export function procurementKey(identity: string, demand: string[], required: number, stockUsed: number) {
  return JSON.stringify([identity, [...demand].sort(), required, stockUsed]);
}
