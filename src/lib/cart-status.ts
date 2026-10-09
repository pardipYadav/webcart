import { evaluateCart, type HoursInput } from "@/lib/hours";
import { getDb } from "@/lib/db";
import { INDIA_TIME_ZONE, validClock } from "@/lib/time";
import type { CartStatus } from "@/lib/types";

/** Set to true to refuse orders outside CART_OPEN_TIME–CART_CLOSE_TIME. */
export const ENFORCE_CART_HOURS = false;

function envFlag(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function prepMinutes(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(120, Math.max(1, Math.round(parsed)));
}

export async function getCartStatus(now = new Date()): Promise<CartStatus> {
  const fallbackOpen = validClock(process.env.CART_OPEN_TIME, "07:00");
  const fallbackClose = validClock(process.env.CART_CLOSE_TIME, "11:30");
  const input: HoursInput = {
    openTime: fallbackOpen,
    closeTime: fallbackClose,
    timeZone: INDIA_TIME_ZONE,
    prepMinutes: prepMinutes(process.env.CART_PREP_MINUTES, 15),
    forceOpen: envFlag("CART_FORCE_OPEN"),
    forceClosed: envFlag("CART_FORCE_CLOSED"),
  };

  try {
    const db = await getDb();
    const doc = db ? await db.collection("settings").findOne({ key: "cart" }) : null;
    if (doc) {
      input.openTime = validClock(doc.openTime, input.openTime);
      input.closeTime = validClock(doc.closeTime, input.closeTime);
      if (doc.prepMinutes !== undefined) input.prepMinutes = prepMinutes(doc.prepMinutes, input.prepMinutes);
      if (doc.forceClosed === true) input.forceClosed = true;
    }
  } catch (error) {
    console.error("[cart] hours unavailable");
  }

  if (envFlag("CART_FORCE_CLOSED")) input.forceClosed = true;
  if (envFlag("CART_FORCE_OPEN")) input.forceOpen = true;

  const status = evaluateCart(now, input);
  if (ENFORCE_CART_HOURS) return status;
  return { ...status, open: true, hoursLabel: "", closedMessage: "" };
}
