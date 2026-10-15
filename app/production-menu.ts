import type { Dish } from "./menu";

export type ProductionIngredient = { name: string; amount: number; unit: string; type: string };
export type ProductionDishSnapshot = {
  dishId: string;
  name: string;
  baseServings: number;
  ingredients: ProductionIngredient[];
  steps?: string[];
  minutes?: number;
  recipeSummary?: string;
  source?: string;
  difficulty?: string;
};
type ProductionCatalogDish = Dish;
type ProductionOrder = { dishes: string; dishSnapshot?: string; publishedMenu?: string };
type PublishedDish = { name: string; description?: string; recipeSnapshot?: ProductionDishSnapshot };
type PublishedMenuValue = { courses?: Array<{ id: string; dishes: PublishedDish[] }> };
type ProductionItem = { dishId: string; quantity: number; snapshot: ProductionDishSnapshot; dish?: ProductionCatalogDish };

function parseList<T>(value?: string): T[] {
  try { return value ? JSON.parse(value) as T[] : []; } catch { return []; }
}

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, "");
}

/** Once a chef publishes a menu, that frozen dish list becomes the source for all kitchen work. */
export function productionItemsForOrder(order: ProductionOrder, catalog: ProductionCatalogDish[]): ProductionItem[] {
  const orderSnapshots = parseList<ProductionDishSnapshot>(order.dishSnapshot);
  let published: PublishedMenuValue | null = null;
  try { published = order.publishedMenu ? JSON.parse(order.publishedMenu) as PublishedMenuValue : null; } catch { /* use the original order */ }

  if (published?.courses?.length) {
    return published.courses.flatMap((course) => course.dishes.map((menuDish, index) => {
      const name = normalizedName(menuDish.name);
      const savedSnapshot = menuDish.recipeSnapshot;
      const catalogDish = catalog.find((dish) => normalizedName(dish.name) === name);
      const recipeSnapshot = savedSnapshot && (savedSnapshot.ingredients.length || savedSnapshot.steps?.length)
        ? savedSnapshot
        : orderSnapshots.find((snapshot) => normalizedName(snapshot.name) === name)
          || (catalogDish ? { dishId: catalogDish.id, name: catalogDish.name, baseServings: catalogDish.baseServings || 4, ingredients: catalogDish.ingredients, steps: catalogDish.steps, minutes: catalogDish.minutes, recipeSummary: catalogDish.recipeSummary, source: catalogDish.source, difficulty: catalogDish.difficulty } : savedSnapshot);
      const dishId = recipeSnapshot?.dishId || `published-${course.id}-${index}-${menuDish.name}`;
      const dish = catalog.find((candidate) => candidate.id === recipeSnapshot?.dishId) || catalogDish;
      const snapshot: ProductionDishSnapshot = recipeSnapshot
        ? { ...recipeSnapshot, dishId, name: menuDish.name }
        : { dishId, name: menuDish.name, baseServings: 4, ingredients: [], steps: [], minutes: 0 };
      return { dishId, quantity: 1, snapshot, dish };
    }));
  }

  return parseList<{ dishId: string; quantity: number }>(order.dishes).map((item) => {
    const savedSnapshot = orderSnapshots.find((candidate) => candidate.dishId === item.dishId);
    const dish = catalog.find((candidate) => candidate.id === item.dishId);
    return {
      ...item,
      snapshot: savedSnapshot || (dish ? { dishId: dish.id, name: dish.name, baseServings: dish.baseServings || 4, ingredients: dish.ingredients, steps: dish.steps, minutes: dish.minutes, recipeSummary: dish.recipeSummary, source: dish.source, difficulty: dish.difficulty } : { dishId: item.dishId, name: "历史菜品", baseServings: 4, ingredients: [] }),
      dish,
    };
  });
}

