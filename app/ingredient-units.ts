export type NormalizedAmount = { amount: number; unit: string };

const aliases: Record<string, { unit: string; factor: number }> = {
  kg: { unit: "g", factor: 1000 },
  千克: { unit: "g", factor: 1000 },
  公斤: { unit: "g", factor: 1000 },
  g: { unit: "g", factor: 1 },
  克: { unit: "g", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  升: { unit: "ml", factor: 1000 },
  ml: { unit: "ml", factor: 1 },
  毫升: { unit: "ml", factor: 1 },
};

/** Convert compatible metric units to one storage/comparison unit. */
export function normalizeIngredientAmount(amount: number, unit: string): NormalizedAmount {
  const trimmed = unit.trim();
  const matched = aliases[trimmed.toLowerCase()] || aliases[trimmed];
  return matched ? { amount: amount * matched.factor, unit: matched.unit } : { amount, unit: trimmed };
}

export function displayIngredientAmount(amount: number, unit: string): NormalizedAmount {
  if (unit === "g" && amount >= 1000) return { amount: amount / 1000, unit: "kg" };
  if (unit === "ml" && amount >= 1000) return { amount: amount / 1000, unit: "L" };
  return { amount, unit };
}
