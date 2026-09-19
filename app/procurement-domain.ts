const ingredientAliases: Record<string, string> = {
  香葱: "小葱", 葱花: "小葱", 青葱: "小葱", 姜: "生姜", 姜片: "生姜", 蒜: "大蒜", 蒜瓣: "大蒜",
  酱油: "生抽", 食盐: "盐", 白砂糖: "白糖", 鸡蛋液: "鸡蛋", 土豆仔: "土豆", 西红柿: "番茄",
};

export function normalizedIngredientName(name: string) {
  const compact = name.trim().replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "");
  return ingredientAliases[compact] || compact;
}

export function shoppingLocation(type: string) {
  if (type === "生鲜" || type === "蔬菜") return "菜市场 / 生鲜区";
  if (type === "调料") return "调味品区";
  return "超市其他区";
}

export function prepActionForIngredient(type: string, name: string) {
  if (type === "生鲜") return /肉|鸡|鸭|牛|羊|排骨/.test(name) ? "分切 / 腌制" : "清洗 / 沥干";
  if (type === "蔬菜") return /葱|姜|蒜|椒/.test(name) ? "清洗 / 切配" : "清洗 / 改刀";
  if (type === "调料") return "提前称量";
  return "备齐待用";
}
