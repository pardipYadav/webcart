import type { Ingredient, Product } from "@/lib/types";

export function optionalIngredients(product: Product) {
  return product.ingredients.filter((ingredient) => ingredient.optional);
}

export function includedIngredients(product: Product) {
  return product.ingredients.filter((ingredient) => !ingredient.optional);
}

export function defaultSelection(product: Product) {
  return product.ingredients.filter((ingredient) => ingredient.included).map((ingredient) => ingredient.id);
}

export function withRequiredIngredients(product: Product, selectedIds: readonly string[]) {
  const required = product.ingredients.filter((ingredient) => ingredient.locked).map((ingredient) => ingredient.id);
  return [...new Set([...required, ...selectedIds])];
}

export function isAllToppings(product: Product, selectedIds: readonly string[]) {
  const optional = optionalIngredients(product);
  return optional.length > 0 && optional.every((ingredient) => selectedIds.includes(ingredient.id));
}

export function selectionState(product: Product, selectedIds: readonly string[]) {
  const selected = new Set(selectedIds);
  const chosen: Ingredient[] = [];
  for (const ingredient of product.ingredients) {
    if (selected.has(ingredient.id)) chosen.push(ingredient);
  }
  const unknown = selectedIds.filter((id) => !product.ingredients.some((ingredient) => ingredient.id === id));
  const toppingsTotal = chosen.reduce((sum, ingredient) => sum + ingredient.price, 0);
  return {
    chosen,
    unknown,
    toppingsTotal,
    total: product.basePrice + toppingsTotal,
  };
}
