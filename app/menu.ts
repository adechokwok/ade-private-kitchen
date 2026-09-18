export type Ingredient = { name: string; amount: number; unit: string; type: "生鲜" | "蔬菜" | "调料" | "其他" };

export type Dish = {
  id: string;
  name: string;
  category: string;
  description: string;
  slogan?: string;
  flavor: string;
  minutes: number;
  baseServings?: number;
  emoji: string;
  tone: string;
  tag?: string;
  imageUrl?: string;
  imagePosition?: string;
  gallery?: string[];
  source?: string;
  steps?: string[];
  active?: boolean;
  isCustom?: boolean;
  featured?: boolean;
  available?: boolean;
  soldOut?: boolean;
  seasons?: string[];
  occasions?: string[];
  dietary?: string[];
  difficulty?: string;
  recipeSummary?: string;
  substitutions?: Array<{ ingredient: string; alternatives: string[]; note: string }>;
  sortOrder?: number;
  ingredients: Ingredient[];
};

export const categories = ["家常热炒", "江浙风味", "川湘小馆", "汤羹主食"];

export const dishes: Dish[] = [
  { id: "cola-wings", name: "可乐鸡翅", category: "家常热炒", description: "酱汁浓郁，鸡翅软嫩入味，是每次都会被抢光的那一道。", slogan: "大人小孩都很难拒绝", flavor: "咸甜 · 不辣", minutes: 35, emoji: "🍗", tone: "amber", tag: "人气", difficulty: "简单", source: "阿德经典菜单", recipeSummary: "鸡翅先煎香再焖煮，最后大火收汁，让咸甜酱汁均匀挂在表面。", steps: [
    "鸡中翅洗净擦干，两面各划两刀；姜切片。",
    "冷水下鸡翅焯去浮沫，捞出后彻底沥干。",
    "锅中放少量油，将鸡翅两面煎至金黄，加入姜片炒香。",
    "倒入生抽和可乐，大火煮开后转中小火，加盖焖约 18 分钟。",
    "开盖转大火不断翻动收汁，酱汁浓稠并均匀裹住鸡翅后出锅。",
  ], ingredients: [
    { name: "鸡中翅", amount: 500, unit: "g", type: "生鲜" }, { name: "可乐", amount: 330, unit: "ml", type: "其他" }, { name: "生抽", amount: 30, unit: "ml", type: "调料" }, { name: "生姜", amount: 15, unit: "g", type: "蔬菜" },
  ]},
  { id: "tomato-beef", name: "番茄炖牛腩", category: "家常热炒", description: "小火慢炖到酥软，酸甜汤汁很适合拌一碗热米饭。", slogan: "汤汁请务必留给米饭", flavor: "酸甜 · 不辣", minutes: 90, emoji: "🥘", tone: "tomato", tag: "慢炖", difficulty: "适中", source: "阿德经典菜单", recipeSummary: "番茄分两次加入：一半炒出红汤，一半后放保留果香；牛腩慢炖到筷子能轻松穿过。", steps: [
    "牛腩切块后冷水下锅，煮开撇去浮沫，捞出用温水洗净。",
    "番茄切块，土豆切滚刀块；锅中少油炒香一半番茄和番茄膏。",
    "放入牛腩翻炒均匀，加入香叶和足量热水，大火煮开。",
    "转小火加盖炖约 60 分钟，加入土豆和剩余番茄再炖 20 分钟。",
    "待牛腩软烂、土豆熟透后按口味加盐，大火略收浓汤汁。",
  ], ingredients: [
    { name: "牛腩", amount: 650, unit: "g", type: "生鲜" }, { name: "番茄", amount: 600, unit: "g", type: "蔬菜" }, { name: "土豆", amount: 300, unit: "g", type: "蔬菜" }, { name: "番茄膏", amount: 40, unit: "g", type: "调料" }, { name: "香叶", amount: 2, unit: "片", type: "调料" },
  ]},
  { id: "shrimp-eggs", name: "滑蛋虾仁", category: "江浙风味", description: "虾仁弹嫩，鸡蛋像云朵一样柔软，清清爽爽。", slogan: "软乎乎的一口鲜", flavor: "鲜香 · 不辣", minutes: 20, emoji: "🍤", tone: "sun", difficulty: "简单", source: "阿德经典菜单", recipeSummary: "虾仁先滑熟，蛋液用余温推至刚刚凝固，保留柔嫩水润的口感。", steps: [
    "虾仁擦干，加少许盐和白胡椒抓匀，静置 10 分钟。",
    "鸡蛋打散，加入葱花和少许盐搅匀。",
    "热锅放油，将虾仁快速滑炒至变色，盛出稍微放凉。",
    "虾仁倒入蛋液；锅中重新放油，倒入后用锅铲从边缘向中间轻推。",
    "蛋液约八成熟、表面仍有光泽时立刻关火，用余温焖至刚凝固。",
  ], ingredients: [
    { name: "鲜虾仁", amount: 300, unit: "g", type: "生鲜" }, { name: "鸡蛋", amount: 6, unit: "个", type: "生鲜" }, { name: "小葱", amount: 15, unit: "g", type: "蔬菜" }, { name: "白胡椒", amount: 2, unit: "g", type: "调料" },
  ]},
  { id: "dongpo-pork", name: "家常东坡肉", category: "江浙风味", description: "方方正正的一块肉，慢煨出油润红亮的温柔滋味。", slogan: "值得为它多添半碗饭", flavor: "酱香 · 不辣", minutes: 120, emoji: "🥩", tone: "wine", tag: "招牌", difficulty: "适中", source: "阿德经典菜单", recipeSummary: "五花肉先焯再煨，黄酒和葱姜打底，小火把肥肉炖化、瘦肉炖酥。", steps: [
    "五花肉整块冷水下锅煮 8 分钟，捞出洗净后切成约 4 厘米方块。",
    "砂锅底部铺满小葱，放入肉块，肉皮朝下码紧。",
    "加入黄酒、生抽、老抽、冰糖和适量热水，大火煮开。",
    "转最小火加盖慢煨约 70 分钟，再将肉块翻面继续煨 30 分钟。",
    "开盖撇去多余油脂，将汤汁收至红亮浓稠，轻轻淋在肉块上。",
  ], ingredients: [
    { name: "五花肉", amount: 750, unit: "g", type: "生鲜" }, { name: "黄酒", amount: 250, unit: "ml", type: "调料" }, { name: "冰糖", amount: 45, unit: "g", type: "调料" }, { name: "老抽", amount: 20, unit: "ml", type: "调料" }, { name: "小葱", amount: 40, unit: "g", type: "蔬菜" },
  ]},
  { id: "mapo-tofu", name: "麻婆豆腐", category: "川湘小馆", description: "麻、辣、烫、香，豆腐嫩而不碎，花椒香气很足。", slogan: "今晚来点热乎带劲的", flavor: "麻辣 · 中辣", minutes: 25, emoji: "🌶️", tone: "chili", difficulty: "适中", source: "阿德经典菜单", recipeSummary: "豆瓣酱要炒出红油，豆腐小火入味，最后分次勾薄芡让汤汁贴住豆腐。", steps: [
    "嫩豆腐切小方块，放入淡盐水中小火焯 1 分钟，捞出沥水。",
    "锅中放油，将猪肉末炒散炒酥，加入郫县豆瓣炒出红油。",
    "加入适量热水煮开，轻轻放入豆腐，小火烧 5 分钟。",
    "分两次淋入薄水淀粉，轻推锅铲让汤汁均匀包裹豆腐。",
    "撒蒜苗和花椒粉，沿锅边淋少许热油后立即出锅。",
  ], ingredients: [
    { name: "嫩豆腐", amount: 500, unit: "g", type: "生鲜" }, { name: "猪肉末", amount: 150, unit: "g", type: "生鲜" }, { name: "郫县豆瓣", amount: 35, unit: "g", type: "调料" }, { name: "花椒粉", amount: 5, unit: "g", type: "调料" }, { name: "蒜苗", amount: 40, unit: "g", type: "蔬菜" },
  ]},
  { id: "pepper-chicken", name: "藤椒鸡", category: "川湘小馆", description: "鸡肉鲜嫩，藤椒清香扑鼻，入口麻而不燥。", slogan: "麻香上头，快乐加倍", flavor: "椒麻 · 微辣", minutes: 45, emoji: "🍃", tone: "green", difficulty: "适中", source: "阿德经典菜单", recipeSummary: "鸡腿煮熟后冰镇锁住嫩度，藤椒料汁现泼现泡，麻香清亮不发苦。", steps: [
    "鸡腿冷水下锅，加入姜片和少许盐，煮开后转小火约 18 分钟。",
    "关火加盖焖 8 分钟，捞入冰水中彻底降温，再沥干斩块。",
    "青线椒和大蒜切碎，与生抽、少许鸡汤调成料汁。",
    "鲜藤椒放在鸡块上，将烧至微微冒烟的热油泼出香气。",
    "倒入料汁浸泡至少 15 分钟，让鸡肉充分吸收椒麻味。",
  ], ingredients: [
    { name: "鸡腿", amount: 700, unit: "g", type: "生鲜" }, { name: "鲜藤椒", amount: 25, unit: "g", type: "调料" }, { name: "青线椒", amount: 80, unit: "g", type: "蔬菜" }, { name: "生抽", amount: 35, unit: "ml", type: "调料" }, { name: "大蒜", amount: 25, unit: "g", type: "蔬菜" },
  ]},
  { id: "lotus-soup", name: "莲藕排骨汤", category: "汤羹主食", description: "粉藕软糯，汤清味甜，是一桌饭里最安稳的暖意。", slogan: "先喝口汤，慢慢吃饭", flavor: "清甜 · 不辣", minutes: 100, emoji: "🍲", tone: "clay", difficulty: "简单", source: "阿德经典菜单", recipeSummary: "排骨焯净后与莲藕小火慢煨，起锅前再调盐，汤更清甜、莲藕更粉糯。", steps: [
    "排骨冷水下锅煮开，撇净浮沫后捞出，用温水洗净。",
    "莲藕去皮切滚刀块，生姜拍松备用。",
    "汤锅中放排骨、莲藕和姜，加入足量热水后大火煮开。",
    "转小火加盖慢煨约 80 分钟，期间尽量不要频繁开盖。",
    "莲藕粉糯、排骨软烂后加盐调味，放入枸杞再煮 3 分钟。",
  ], ingredients: [
    { name: "猪肋排", amount: 600, unit: "g", type: "生鲜" }, { name: "莲藕", amount: 500, unit: "g", type: "蔬菜" }, { name: "生姜", amount: 15, unit: "g", type: "蔬菜" }, { name: "枸杞", amount: 10, unit: "g", type: "其他" },
  ]},
  { id: "scallion-noodles", name: "葱油拌面", category: "汤羹主食", description: "焦香葱油裹住每一根面，简单却总让人想再来一碗。", slogan: "简单，但会让人想念", flavor: "葱香 · 不辣", minutes: 25, emoji: "🍜", tone: "noodle", difficulty: "简单", source: "阿德经典菜单", recipeSummary: "小火慢熬葱油至葱段焦黄，酱汁煮到冒细泡，趁面条热时迅速拌匀。", steps: [
    "小葱洗净彻底擦干，切成长段，葱白和葱绿分开放。",
    "冷锅放油和葱白，小火慢熬，葱白变软后加入葱绿。",
    "持续小火熬至葱段焦黄酥脆，捞出葱段备用。",
    "葱油中加入生抽、老抽和白糖，小火煮至糖融化并冒细泡。",
    "面条煮熟后沥干，趁热加入葱油酱汁拌匀，最后放上酥葱。",
  ], ingredients: [
    { name: "细面", amount: 500, unit: "g", type: "其他" }, { name: "小葱", amount: 150, unit: "g", type: "蔬菜" }, { name: "生抽", amount: 40, unit: "ml", type: "调料" }, { name: "老抽", amount: 15, unit: "ml", type: "调料" }, { name: "白糖", amount: 15, unit: "g", type: "调料" },
  ]},
];

export const getDish = (id: string) => dishes.find((dish) => dish.id === id);
