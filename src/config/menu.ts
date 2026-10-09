import type { Product } from "@/lib/types";

/**
 * Breakfast menu, ingredients, and prices.
 *
 * Edit this file to add, remove, or reprice items. Included ingredients
 * (`included: true`, `price: 0`) start selected. Optional toppings
 * (`optional: true`) are what "All available toppings" selects.
 *
 * A future admin screen can replace this list by saving a `settings`
 * document `{ key: "menu", products: [...] }` in MongoDB. The site reads
 * that document when it exists and falls back to this file.
 */
export const defaultProducts: Product[] = [
  {
    id: "oats-bowl",
    name: "Oats Bowl",
    tagline: "Oats, milk, nuts, and seeds",
    description:
      "A warm bowl of oats and hot milk, finished with the nuts, seeds, and fruit you choose.",
    baseLabel: "In the bowl",
    basePrice: 120,
    image: "/menu/oats-bowl.jpg",
    imageAlt: "Oats bowl topped with nuts, seeds, and peanut butter",
    accent: "green",
    ingredients: [
      { id: "oats", name: "Oats", included: true, optional: false, price: 0 },
      { id: "hot-milk", name: "Hot Milk", included: true, optional: false, price: 0 },
      { id: "pumpkin-seeds", name: "Pumpkin Seeds", included: false, optional: true, price: 15 },
      { id: "chia-seeds", name: "Chia Seeds", included: false, optional: true, price: 15 },
      { id: "sunflower-seeds", name: "Sunflower Seeds", included: false, optional: true, price: 15 },
      { id: "almonds", name: "Almonds", included: false, optional: true, price: 20 },
      { id: "walnuts", name: "Walnuts", included: false, optional: true, price: 20 },
      { id: "banana", name: "Banana", included: false, optional: true, price: 15 },
      { id: "seasonal-fruits", name: "Seasonal Fruits", included: false, optional: true, price: 25 },
      { id: "honey", name: "Honey", included: false, optional: true, price: 10 },
      { id: "peanut-butter", name: "Peanut Butter", included: false, optional: true, price: 20 },
    ],
  },
  {
    id: "pb-sandwich",
    name: "Peanut Butter Sandwich",
    tagline: "Whole-wheat bread, peanut butter, and banana",
    description:
      "Whole-wheat bread and peanut butter, with banana, seeds, and honey if you want them.",
    baseLabel: "On the sandwich",
    basePrice: 90,
    image: "/menu/pb-sandwich.jpg",
    imageAlt: "Peanut butter and banana sandwich on whole-wheat bread",
    accent: "gold",
    ingredients: [
      { id: "whole-wheat-bread", name: "Whole-Wheat Bread", included: true, optional: false, price: 0 },
      { id: "peanut-butter", name: "Peanut Butter", included: true, optional: false, price: 0 },
      { id: "banana", name: "Banana", included: false, optional: true, price: 15 },
      { id: "pumpkin-seeds", name: "Pumpkin Seeds", included: false, optional: true, price: 10 },
      { id: "chia-seeds", name: "Chia Seeds", included: false, optional: true, price: 10 },
      { id: "sunflower-seeds", name: "Sunflower Seeds", included: false, optional: true, price: 10 },
      { id: "honey", name: "Honey", included: false, optional: true, price: 10 },
    ],
  },
];
