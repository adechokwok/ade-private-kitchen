import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import Database from "better-sqlite3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const positional = args.filter((arg) => !arg.startsWith("--"));
const inputPath = path.resolve(positional[0] || "work/recipe-import.json");
const databasePath = path.resolve(positional[1] || process.env.DATABASE_PATH || path.join(process.cwd(), "data", "ade-kitchen.sqlite"));
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "work", "db-backups"));

if (!fs.existsSync(inputPath)) throw new Error(`找不到导入文件：${inputPath}`);
if (!fs.existsSync(databasePath)) throw new Error(`找不到数据库：${databasePath}`);

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
const ingredientTypes = new Set(["生鲜", "蔬菜", "调料", "其他"]);
const difficulties = new Set(["简单", "适中", "进阶"]);

function cleanText(value, max, fallback = "") {
  const text = typeof value === "string" ? value.trim() : fallback;
  return text.slice(0, max);
}

function normalizeRecipe(value, index) {
  if (!value || typeof value !== "object") throw new Error(`第 ${index + 1} 道菜格式无效`);
  const name = cleanText(value.name, 40);
  const category = cleanText(value.category, 30);
  if (!name || !category) throw new Error(`第 ${index + 1} 道菜缺少菜名或分类`);
  const ingredients = Array.isArray(value.ingredients) ? value.ingredients.map((item) => ({
    name: cleanText(item?.name, 40),
    amount: Number(item?.amount),
    unit: cleanText(item?.unit, 12),
    type: ingredientTypes.has(item?.type) ? item.type : "其他",
  })).filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0 && item.unit) : [];
  const steps = Array.isArray(value.steps)
    ? value.steps.filter((step) => typeof step === "string").map((step) => step.trim().slice(0, 500)).filter(Boolean).slice(0, 30)
    : [];
  if (!ingredients.length) throw new Error(`${name} 没有可导入的食材`);
  if (!steps.length) throw new Error(`${name} 没有可导入的步骤`);
  return {
    name,
    category,
    description: cleanText(value.description, 180),
    slogan: cleanText(value.slogan, 60),
    flavor: cleanText(value.flavor, 30, "家常风味") || "家常风味",
    minutes: Math.min(360, Math.max(5, Math.round(Number(value.minutes) || 30))),
    baseServings: Math.min(20, Math.max(1, Math.round(Number(value.baseServings) || 4))),
    ingredients,
    steps,
    source: cleanText(value.source, 80, "菜谱大全") || "菜谱大全",
    difficulty: difficulties.has(value.difficulty) ? value.difficulty : "适中",
    recipeSummary: cleanText(value.recipeSummary, 240),
  };
}

const normalized = recipes.map(normalizeRecipe);
const duplicateNames = normalized.map((recipe) => recipe.name).filter((name, index, names) => names.indexOf(name) !== index);
if (duplicateNames.length) throw new Error(`导入文件中有重名菜品：${[...new Set(duplicateNames)].join("、")}`);

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");

const existingNames = new Set(db.prepare("SELECT name FROM custom_dishes").all().map((row) => row.name));
const summary = {
  total: normalized.length,
  toInsert: normalized.filter((recipe) => !existingNames.has(recipe.name)).length,
  toUpdate: normalized.filter((recipe) => existingNames.has(recipe.name)).length,
};

if (dryRun) {
  console.log(JSON.stringify({ ok: true, dryRun: true, ...summary }, null, 2));
  db.close();
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `ade-kitchen-before-recipe-import-${stamp}.sqlite`);
await db.backup(backupPath);

const existingByName = db.prepare("SELECT id, sort_order FROM custom_dishes WHERE name = ?");
const updateDish = db.prepare(`UPDATE custom_dishes SET
  name = @name, category = @category, description = @description, slogan = @slogan,
  flavor = @flavor, minutes = @minutes, base_servings = @baseServings,
  ingredients = @ingredients, steps = @steps, source = @source,
  difficulty = @difficulty, recipe_summary = @recipeSummary
  WHERE id = @id`);
const insertDish = db.prepare(`INSERT INTO custom_dishes (
  id, name, category, description, slogan, flavor, minutes, base_servings,
  image_url, image_position, gallery, ingredients, steps, source,
  active, featured, available, sold_out, seasons, occasions, dietary,
  difficulty, recipe_summary, substitutions, sort_order
) VALUES (
  @id, @name, @category, @description, @slogan, @flavor, @minutes, @baseServings,
  '', 'center', '[]', @ingredients, @steps, @source,
  1, 0, 1, 0, '[]', '[]', '[]',
  @difficulty, @recipeSummary, '[]', @sortOrder
)`);
const insertCategory = db.prepare("INSERT OR IGNORE INTO menu_categories (id, name, sort_order) VALUES (?, ?, ?)");
let nextSortOrder = Number(db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM custom_dishes").get().value) + 1;
let nextCategoryOrder = Number(db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM menu_categories").get().value) + 1;

const importRecipes = db.transaction(() => {
  for (const recipe of normalized) {
    const row = {
      ...recipe,
      ingredients: JSON.stringify(recipe.ingredients),
      steps: JSON.stringify(recipe.steps),
    };
    const existing = existingByName.get(recipe.name);
    if (existing) {
      updateDish.run({ ...row, id: existing.id });
    } else {
      insertDish.run({ ...row, id: randomUUID(), sortOrder: nextSortOrder });
      nextSortOrder += 1;
    }
    insertCategory.run(randomUUID(), recipe.category, nextCategoryOrder);
    nextCategoryOrder += 1;
  }
});

try {
  importRecipes();
  const totalDishes = Number(db.prepare("SELECT COUNT(*) AS value FROM custom_dishes").get().value);
  console.log(JSON.stringify({ ok: true, ...summary, totalDishes, backupPath }, null, 2));
} finally {
  db.close();
}
