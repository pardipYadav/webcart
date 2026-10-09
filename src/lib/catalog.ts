import { defaultMessages } from "@/config/messages";
import { defaultProducts } from "@/config/menu";
import { getDb } from "@/lib/db";
import { messageForDate } from "@/lib/health";
import { zonedDateKey } from "@/lib/time";
import type { HealthNote, Product } from "@/lib/types";

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const item = value as Product;
  if (typeof item.id !== "string" || !item.id) return false;
  if (typeof item.name !== "string" || typeof item.tagline !== "string") return false;
  if (typeof item.description !== "string" || typeof item.baseLabel !== "string") return false;
  if (typeof item.basePrice !== "number" || item.basePrice < 0) return false;
  if (typeof item.image !== "string" || typeof item.imageAlt !== "string") return false;
  if (item.accent !== "green" && item.accent !== "gold") return false;
  if (!Array.isArray(item.ingredients) || item.ingredients.length === 0) return false;
  return item.ingredients.every((ingredient) => {
    return (
      !!ingredient &&
      typeof ingredient.id === "string" &&
      typeof ingredient.name === "string" &&
      typeof ingredient.included === "boolean" &&
      typeof ingredient.optional === "boolean" &&
      typeof ingredient.price === "number" &&
      ingredient.price >= 0
    );
  });
}

export async function getMenu(): Promise<Product[]> {
  try {
    const db = await getDb();
    const doc = db ? await db.collection("settings").findOne({ key: "menu" }) : null;
    const products = doc && Array.isArray(doc.products) ? doc.products.filter(isProduct) : [];
    if (products.length > 0) return products;
  } catch (error) {
    console.error("[catalog] menu unavailable");
  }
  return defaultProducts;
}

export async function getHealthMessages(): Promise<string[]> {
  try {
    const db = await getDb();
    const doc = db ? await db.collection("settings").findOne({ key: "messages" }) : null;
    if (doc && Array.isArray(doc.messages)) {
      const messages = doc.messages.filter((message): message is string => typeof message === "string" && message.trim().length > 0);
      if (messages.length > 0) return messages.map((message) => message.trim());
    }
  } catch (error) {
    console.error("[catalog] messages unavailable");
  }
  return defaultMessages;
}

export async function getDailyHealthMessage(now = new Date()): Promise<HealthNote> {
  const messages = await getHealthMessages();
  const date = zonedDateKey(now);
  return { date, text: messageForDate(messages, date) };
}
