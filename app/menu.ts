export type Ingredient = { name: string; amount: number; unit: string; type: "生鲜" | "蔬菜" | "调料" | "其他" };

export type Dish = {
  id: string;
  name: string;
  category: string;
  description: string;
  flavor: string;
  minutes: number;
  emoji: string;
  tone: string;
  tag?: string;
  ingredients: Ingredient[];
};

export const categories = ["家常热炒", "江浙风味", "川湘小馆", "汤羹主食"];

export const dishes: Dish[] = [
  { id: "cola-wings", name: "可乐鸡翅", category: "家常热炒", description: "酱汁浓郁，鸡翅软嫩入味，是每次都会被抢光的那一道。", flavor: "咸甜 · 不辣", minutes: 35, emoji: "🍗", tone: "amber", tag: "人气", ingredients: [
    { name: "鸡中翅", amount: 500, unit: "g", type: "生鲜" }, { name: "可乐", amount: 330, unit: "ml", type: "其他" }, { name: "生抽", amount: 30, unit: "ml", type: "调料" }, { name: "生姜", amount: 15, unit: "g", type: "蔬菜" },
  ]},
  { id: "tomato-beef", name: "番茄炖牛腩", category: "家常热炒", description: "小火慢炖到酥软，酸甜汤汁很适合拌一碗热米饭。", flavor: "酸甜 · 不辣", minutes: 90, emoji: "🥘", tone: "tomato", tag: "慢炖", ingredients: [
    { name: "牛腩", amount: 650, unit: "g", type: "生鲜" }, { name: "番茄", amount: 600, unit: "g", type: "蔬菜" }, { name: "土豆", amount: 300, unit: "g", type: "蔬菜" }, { name: "番茄膏", amount: 40, unit: "g", type: "调料" }, { name: "香叶", amount: 2, unit: "片", type: "调料" },
  ]},
  { id: "shrimp-eggs", name: "滑蛋虾仁", category: "江浙风味", description: "虾仁弹嫩，鸡蛋像云朵一样柔软，清清爽爽。", flavor: "鲜香 · 不辣", minutes: 20, emoji: "🍤", tone: "sun", ingredients: [
    { name: "鲜虾仁", amount: 300, unit: "g", type: "生鲜" }, { name: "鸡蛋", amount: 6, unit: "个", type: "生鲜" }, { name: "小葱", amount: 15, unit: "g", type: "蔬菜" }, { name: "白胡椒", amount: 2, unit: "g", type: "调料" },
  ]},
  { id: "dongpo-pork", name: "家常东坡肉", category: "江浙风味", description: "方方正正的一块肉，慢煨出油润红亮的温柔滋味。", flavor: "酱香 · 不辣", minutes: 120, emoji: "🥩", tone: "wine", tag: "招牌", ingredients: [
    { name: "五花肉", amount: 750, unit: "g", type: "生鲜" }, { name: "黄酒", amount: 250, unit: "ml", type: "调料" }, { name: "冰糖", amount: 45, unit: "g", type: "调料" }, { name: "老抽", amount: 20, unit: "ml", type: "调料" }, { name: "小葱", amount: 40, unit: "g", type: "蔬菜" },
  ]},
  { id: "mapo-tofu", name: "麻婆豆腐", category: "川湘小馆", description: "麻、辣、烫、香，豆腐嫩而不碎，花椒香气很足。", flavor: "麻辣 · 中辣", minutes: 25, emoji: "🌶️", tone: "chili", ingredients: [
    { name: "嫩豆腐", amount: 500, unit: "g", type: "生鲜" }, { name: "猪肉末", amount: 150, unit: "g", type: "生鲜" }, { name: "郫县豆瓣", amount: 35, unit: "g", type: "调料" }, { name: "花椒粉", amount: 5, unit: "g", type: "调料" }, { name: "蒜苗", amount: 40, unit: "g", type: "蔬菜" },
  ]},
  { id: "pepper-chicken", name: "藤椒鸡", category: "川湘小馆", description: "鸡肉鲜嫩，藤椒清香扑鼻，入口麻而不燥。", flavor: "椒麻 · 微辣", minutes: 45, emoji: "🍃", tone: "green", ingredients: [
    { name: "鸡腿", amount: 700, unit: "g", type: "生鲜" }, { name: "鲜藤椒", amount: 25, unit: "g", type: "调料" }, { name: "青线椒", amount: 80, unit: "g", type: "蔬菜" }, { name: "生抽", amount: 35, unit: "ml", type: "调料" }, { name: "大蒜", amount: 25, unit: "g", type: "蔬菜" },
  ]},
  { id: "lotus-soup", name: "莲藕排骨汤", category: "汤羹主食", description: "粉藕软糯，汤清味甜，是一桌饭里最安稳的暖意。", flavor: "清甜 · 不辣", minutes: 100, emoji: "🍲", tone: "clay", ingredients: [
    { name: "猪肋排", amount: 600, unit: "g", type: "生鲜" }, { name: "莲藕", amount: 500, unit: "g", type: "蔬菜" }, { name: "生姜", amount: 15, unit: "g", type: "蔬菜" }, { name: "枸杞", amount: 10, unit: "g", type: "其他" },
  ]},
  { id: "scallion-noodles", name: "葱油拌面", category: "汤羹主食", description: "焦香葱油裹住每一根面，简单却总让人想再来一碗。", flavor: "葱香 · 不辣", minutes: 25, emoji: "🍜", tone: "noodle", ingredients: [
    { name: "细面", amount: 500, unit: "g", type: "其他" }, { name: "小葱", amount: 150, unit: "g", type: "蔬菜" }, { name: "生抽", amount: 40, unit: "ml", type: "调料" }, { name: "老抽", amount: 15, unit: "ml", type: "调料" }, { name: "白糖", amount: 15, unit: "g", type: "调料" },
  ]},
];

export const getDish = (id: string) => dishes.find((dish) => dish.id === id);
