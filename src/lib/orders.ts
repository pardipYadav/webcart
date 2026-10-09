import { z } from "zod";
import { isPickupMinutes, pickupLabel } from "@/config/pickup";
import { getCartStatus } from "@/lib/cart-status";
import { getMenu } from "@/lib/catalog";
import { cleanInstructions, cleanName, normalizeMobile } from "@/lib/phone";
import { selectionState } from "@/lib/pricing";
import { rateLimit } from "@/lib/rate-limit";
import { buildWhatsAppMessage } from "@/lib/order-text";
import { getStore, type OrderDraft, type StoredOrder } from "@/lib/store";
import { formatOrderDate, formatOrderTime, INDIA_TIME_ZONE } from "@/lib/time";
import type { OrderResponse } from "@/lib/types";
import { manualUrlFor, notifyOwner } from "@/lib/whatsapp";

const payloadSchema = z.object({
  idempotencyKey: z.string().uuid(),
  customerName: z.string().max(80),
  mobile: z.string().max(20),
  productId: z.string().min(1).max(40),
  ingredientIds: z.array(z.string().min(1).max(40)).max(40),
  instructions: z.string().max(400).optional(),
  pickupMinutes: z.number().int(),
  website: z.string().max(200).optional(),
  startedAt: z.number(),
});

export type PlaceOrderResult =
  | { ok: true; status: 200; body: OrderResponse }
  | { ok: false; status: number; body: { error: string; field?: string } };

function fail(status: number, error: string, field?: string): PlaceOrderResult {
  return { ok: false, status, body: field ? { error, field } : { error } };
}

function present(order: StoredOrder): OrderResponse {
  return {
    order: {
      orderId: order.orderId,
      customerName: order.customerName,
      mobile: order.mobile,
      productName: order.productName,
      ingredients: order.ingredients.map((ingredient) => ingredient.name),
      instructions: order.instructions,
      pickupLabel: order.pickupLabel,
      total: order.total,
      dateLabel: order.dateLabel,
      timeLabel: order.timeLabel,
    },
    whatsapp: {
      sent: order.whatsapp.sent,
      manualUrl: manualUrlFor(order.message),
    },
  };
}

function ensureMessage(order: StoredOrder) {
  if (order.message.includes(`#${order.orderId}`)) return order.message;
  order.message = buildWhatsAppMessage({
    orderId: order.orderId,
    customerName: order.customerName,
    mobile: order.mobile,
    productName: order.productName,
    ingredients: order.ingredients,
    instructions: order.instructions,
    dateLabel: order.dateLabel,
    timeLabel: order.timeLabel,
    pickupLabel: order.pickupLabel,
  });
  return order.message;
}

async function sendAndStore(order: StoredOrder) {
  ensureMessage(order);
  const notice = await notifyOwner(order.message, templateParameters(order));
  order.whatsapp = { sent: notice.sent, mode: notice.mode };
  try {
    const store = await getStore();
    await store?.updateMessage(order.orderId, order.message);
    await store?.updateWhatsApp(order.orderId, order.whatsapp);
  } catch {
    console.error("[orders] could not record WhatsApp status");
  }
  return order;
}

export async function placeOrder(payload: unknown, ip: string): Promise<PlaceOrderResult> {
  if (!rateLimit(`ip:${ip}`, 30, 15 * 60 * 1000)) {
    return fail(429, "Too many attempts. Please wait a few minutes and try again.");
  }

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return fail(400, "Check the form and try again.");

  const input = parsed.data;
  if (input.website) return fail(400, "Check the form and try again.");

  const elapsed = Date.now() - input.startedAt;
  if (elapsed >= 0 && elapsed < 700) {
    return fail(400, "Please take a second to check the order, then send it again.");
  }
  if (elapsed > 12 * 60 * 60 * 1000) {
    return fail(400, "This page has been open too long. Please refresh and try again.");
  }

  const customerName = cleanName(input.customerName);
  if (!customerName) return fail(400, "Please enter your name.", "customerName");

  const mobile = normalizeMobile(input.mobile);
  if (!mobile) return fail(400, "Enter a 10-digit mobile number.", "mobile");

  if (!isPickupMinutes(input.pickupMinutes)) {
    return fail(400, "Choose a pickup time.", "pickupMinutes");
  }

  const menu = await getMenu();
  const product = menu.find((item) => item.id === input.productId);
  if (!product) return fail(400, "That breakfast is not on the menu.");

  const selection = selectionState(product, [...new Set(input.ingredientIds)]);
  if (selection.unknown.length > 0) {
    return fail(400, "One of the toppings is no longer available. Please refresh.", "ingredients");
  }
  if (selection.chosen.length === 0) {
    return fail(400, "Choose at least one ingredient.", "ingredients");
  }

  const status = await getCartStatus();
  if (!status.open) return fail(403, status.closedMessage);

  const store = await getStore();
  if (!store) {
    return fail(503, "We could not save the order just now. Please tell the cart directly.");
  }

  const existing = await store.findByIdempotency(input.idempotencyKey);
  if (existing) {
    if (!existing.whatsapp.sent) await sendAndStore(existing);
    return { ok: true, status: 200, body: present(existing) };
  }

  const instructions = cleanInstructions(input.instructions ?? "");
  const chosenLabel = pickupLabel(input.pickupMinutes) ?? "As soon as it's ready";
  const signature = [product.id, selection.chosen.map((item) => item.id).join(","), instructions, String(input.pickupMinutes)].join("|");
  const since = new Date(Date.now() - 45_000).toISOString();
  const duplicate = await store.findRecentSignature(`${mobile}|${signature}`, since);
  if (duplicate) return { ok: true, status: 200, body: present(duplicate) };

  const recentCount = await store.countRecentMobile(mobile, new Date(Date.now() - 30 * 60 * 1000).toISOString());
  if (recentCount >= 5) {
    return fail(429, "Too many orders from this number. Please wait a little while.");
  }

  const now = new Date();
  const draftBase: Omit<OrderDraft, "message"> = {
    idempotencyKey: input.idempotencyKey,
    customerName,
    mobile,
    productId: product.id,
    productName: product.name,
    ingredients: selection.chosen.map((item) => ({ id: item.id, name: item.name, price: item.price })),
    instructions,
    pickupMinutes: input.pickupMinutes,
    pickupLabel: chosenLabel,
    basePrice: product.basePrice,
    toppingsTotal: selection.toppingsTotal,
    total: selection.total,
    currency: "INR" as const,
    dateLabel: formatOrderDate(now),
    timeLabel: formatOrderTime(now),
    timeZone: INDIA_TIME_ZONE,
    signature: `${mobile}|${signature}`,
    createdAt: now.toISOString(),
    whatsapp: { sent: false, mode: "manual" as const },
  };
  const inserted = await store.insert({ ...draftBase, message: "" });
  if (inserted.created || !inserted.order.whatsapp.sent) {
    await sendAndStore(inserted.order);
  }

  return { ok: true, status: 200, body: present(inserted.order) };
}

function templateParameters(order: StoredOrder) {
  return [
    `#${order.orderId}`,
    order.customerName,
    order.mobile,
    order.productName,
    order.ingredients.map((item) => item.name).join(", "),
    order.instructions || "None",
    order.dateLabel,
    order.timeLabel,
    order.pickupLabel,
  ];
}
