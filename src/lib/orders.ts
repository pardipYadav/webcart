import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getCartStatus } from "@/lib/cart-status";
import { getMenu } from "@/lib/catalog";
import { formatInr } from "@/lib/money";
import { buildConfirmationMessage, buildPaymentMessage, buildWhatsAppMessage, type OrderMessageInput } from "@/lib/order-text";
import {
  cleanPaymentReference,
  configuredOwnerKey,
  paymentAccount,
  paymentDetails,
  sameSecret,
} from "@/lib/payment";
import { cleanInstructions, cleanName, normalizeMobile } from "@/lib/phone";
import { selectionState, withRequiredIngredients } from "@/lib/pricing";
import { rateLimit } from "@/lib/rate-limit";
import { getStore, type StoredOrder } from "@/lib/store";
import { formatOrderDate, formatOrderTime, INDIA_TIME_ZONE } from "@/lib/time";
import type { DeskOrder, OrderResponse, OrderStatus } from "@/lib/types";
import { manualUrlFor, notifyOwner, orderPhoneLabel } from "@/lib/whatsapp";

const payloadSchema = z.object({
  idempotencyKey: z.string().uuid(),
  customerName: z.string().max(80),
  mobile: z.string().max(20),
  productId: z.string().min(1).max(40),
  ingredientIds: z.array(z.string().min(1).max(40)).max(40),
  instructions: z.string().max(400).optional(),
  website: z.string().max(200).optional(),
  startedAt: z.number(),
});

const paymentSchema = z.object({
  accessToken: z.string().min(16).max(80),
  reference: z.string().max(40),
});

export type PlaceOrderResult =
  | { ok: true; status: 200; body: OrderResponse }
  | { ok: false; status: number; body: { error: string; field?: string } };

export type ConfirmOrderResult =
  | { ok: true; status: 200; body: { orderId: string; status: OrderStatus; whatsapp: { sent: boolean; manualUrl: string | null } } }
  | { ok: false; status: number; body: { error: string } };

function fail(status: number, error: string, field?: string): PlaceOrderResult {
  return { ok: false, status, body: field ? { error, field } : { error } };
}

function orderIdOk(orderId: string) {
  return /^BF\d{4,}$/.test(orderId);
}

function messageInput(order: StoredOrder, verifyUrl = ""): OrderMessageInput {
  const account = paymentAccount();
  return {
    orderId: order.orderId,
    customerName: order.customerName,
    mobile: order.mobile,
    productName: order.productName,
    ingredients: order.ingredients,
    instructions: order.instructions,
    quantity: order.quantity || 1,
    total: order.total,
    dateLabel: order.dateLabel,
    timeLabel: order.timeLabel,
    payeeName: account?.payeeName,
    upiId: account?.upiId,
    paymentReference: order.paymentReference,
    verifyUrl,
  };
}

function verifyLink(origin: string, order: StoredOrder) {
  if (!origin || !order.verifyToken) return "";
  return `${origin.replace(/\/$/, "")}/verify/${order.orderId}?token=${order.verifyToken}`;
}

async function present(order: StoredOrder): Promise<OrderResponse> {
  const account = paymentAccount();
  return {
    order: {
      orderId: order.orderId,
      customerName: order.customerName,
      mobile: order.mobile,
      productName: order.productName,
      ingredients: order.ingredients.map((ingredient) => ingredient.name),
      instructions: order.instructions,
      quantity: order.quantity || 1,
      total: order.total,
      status: order.status === "confirmed" ? "confirmed" : "pending_payment",
      paymentReference: order.paymentReference || "",
      payment: account ? await paymentDetails(order.orderId, order.total, account) : null,
      dateLabel: order.dateLabel,
      timeLabel: order.timeLabel,
    },
    accessToken: order.accessToken,
    whatsapp: {
      sent: order.whatsapp.sent,
      manualUrl: manualUrlFor(order.message),
      orderPhone: orderPhoneLabel(),
    },
    paymentWhatsapp: order.paymentReference
      ? { sent: order.paymentNotified, manualUrl: manualUrlFor(buildPaymentMessage(messageInput(order))) }
      : null,
  };
}

function customerMessage(order: StoredOrder) {
  return buildWhatsAppMessage(messageInput(order));
}

function ensureMessage(order: StoredOrder) {
  if (order.message.includes(`#${order.orderId}`)) return order.message;
  order.message = customerMessage(order);
  return order.message;
}

async function sendAndStore(order: StoredOrder, origin: string) {
  ensureMessage(order);
  const ownerText = buildWhatsAppMessage(messageInput(order, verifyLink(origin, order)));
  const notice = await notifyOwner(ownerText, templateParameters(order, verifyLink(origin, order)));
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

export async function placeOrder(payload: unknown, ip: string, origin = ""): Promise<PlaceOrderResult> {
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

  const menu = await getMenu();
  const product = menu.find((item) => item.id === input.productId);
  if (!product) return fail(400, "That breakfast is not on the menu.");

  const selection = selectionState(product, withRequiredIngredients(product, input.ingredientIds));
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
    if (process.env.MONGODB_URI?.trim()) {
      return fail(503, "We could not save the order just now. Please tell the cart directly.");
    }
    const instructions = cleanInstructions(input.instructions ?? "");
    const now = new Date();
    const order: StoredOrder = {
      orderId: `BF${Date.now()}`,
      idempotencyKey: input.idempotencyKey,
      customerName,
      mobile,
      productId: product.id,
      productName: product.name,
      ingredients: selection.chosen.map((item) => ({ id: item.id, name: item.name, price: item.price })),
      instructions,
      quantity: 1,
      basePrice: product.basePrice,
      toppingsTotal: selection.toppingsTotal,
      total: selection.total,
      currency: "INR",
      status: "pending_payment",
      accessToken: randomUUID(),
      verifyToken: randomBytes(24).toString("hex"),
      paymentReference: "",
      paymentSubmittedAt: null,
      paymentNotified: false,
      confirmedAt: null,
      dateLabel: formatOrderDate(now),
      timeLabel: formatOrderTime(now),
      timeZone: INDIA_TIME_ZONE,
      signature: "",
      createdAt: now.toISOString(),
      whatsapp: { sent: false, mode: "manual" },
      message: "",
    };
    await sendAndStore(order, "");
    return { ok: true, status: 200, body: await present(order) };
  }

  const existing = await store.findByIdempotency(input.idempotencyKey);
  if (existing) {
    if (!existing.whatsapp.sent) await sendAndStore(existing, origin);
    return { ok: true, status: 200, body: await present(existing) };
  }

  const instructions = cleanInstructions(input.instructions ?? "");
  const signature = [product.id, selection.chosen.map((item) => item.id).join(","), instructions].join("|");
  const since = new Date(Date.now() - 45_000).toISOString();
  const duplicate = await store.findRecentSignature(`${mobile}|${signature}`, since);
  if (duplicate) return { ok: true, status: 200, body: await present(duplicate) };

  const recentCount = await store.countRecentMobile(mobile, new Date(Date.now() - 30 * 60 * 1000).toISOString());
  if (recentCount >= 5) {
    return fail(429, "Too many orders from this number. Please wait a little while.");
  }

  const now = new Date();
  const inserted = await store.insert({
    idempotencyKey: input.idempotencyKey,
    customerName,
    mobile,
    productId: product.id,
    productName: product.name,
    ingredients: selection.chosen.map((item) => ({ id: item.id, name: item.name, price: item.price })),
    instructions,
    quantity: 1,
    basePrice: product.basePrice,
    toppingsTotal: selection.toppingsTotal,
    total: selection.total,
    currency: "INR",
    status: "pending_payment",
    accessToken: randomUUID(),
    verifyToken: randomBytes(24).toString("hex"),
    paymentReference: "",
    paymentSubmittedAt: null,
    paymentNotified: false,
    confirmedAt: null,
    dateLabel: formatOrderDate(now),
    timeLabel: formatOrderTime(now),
    timeZone: INDIA_TIME_ZONE,
    signature: `${mobile}|${signature}`,
    createdAt: now.toISOString(),
    whatsapp: { sent: false, mode: "manual" },
    message: "",
  });
  if (inserted.created || !inserted.order.whatsapp.sent) {
    await sendAndStore(inserted.order, origin);
  }

  return { ok: true, status: 200, body: await present(inserted.order) };
}

export async function getCustomerOrder(orderId: string, accessToken: string, ip = "local"): Promise<PlaceOrderResult> {
  if (!rateLimit(`read:${ip}:${orderId}`, 120, 5 * 60 * 1000)) {
    return fail(429, "Please wait a moment, then refresh.");
  }
  if (!orderIdOk(orderId) || !accessToken) return fail(404, "That order could not be found.");
  const store = await getStore();
  const order = await store?.findByOrderId(orderId);
  if (!order || !sameSecret(order.accessToken, accessToken)) return fail(404, "That order could not be found.");
  return { ok: true, status: 200, body: await present(order) };
}

export async function submitPayment(orderId: string, payload: unknown, ip: string, origin = ""): Promise<PlaceOrderResult> {
  if (!rateLimit(`pay:${ip}:${orderId}`, 10, 15 * 60 * 1000)) {
    return fail(429, "Too many attempts. Please wait a few minutes and try again.");
  }
  if (!orderIdOk(orderId)) return fail(404, "That order could not be found.");

  const parsed = paymentSchema.safeParse(payload);
  if (!parsed.success) return fail(400, "Enter the UPI reference from Google Pay.", "reference");

  const reference = cleanPaymentReference(parsed.data.reference);
  if (!reference) return fail(400, "Enter the 12-digit UPI reference from Google Pay.", "reference");

  const store = await getStore();
  if (!store) return fail(503, "We could not save the payment just now. Please try again.");

  const current = await store.findByOrderId(orderId);
  if (!current || !sameSecret(current.accessToken, parsed.data.accessToken)) {
    return fail(404, "That order could not be found.");
  }
  if (current.status === "confirmed") return { ok: true, status: 200, body: await present(current) };

  const saved = await store.savePayment(orderId, reference, new Date().toISOString());
  if (!saved) return fail(404, "That order could not be found.");

  if (saved.changed) {
    const text = buildPaymentMessage(messageInput(saved.order));
    const link = verifyLink(origin, saved.order);
    const notice = await notifyOwner(link ? `${text}\n\nVerify payment: ${link}` : text);
    if (notice.sent) {
      await store.markPaymentNotified(orderId);
      saved.order.paymentNotified = true;
    }
  }

  return { ok: true, status: 200, body: await present(saved.order) };
}

export async function confirmOrder(
  orderId: string,
  input: { verifyToken?: string; ownerKey?: string },
  ip: string,
): Promise<ConfirmOrderResult> {
  if (!rateLimit(`confirm:${ip}`, 30, 15 * 60 * 1000)) {
    return { ok: false, status: 429, body: { error: "Too many attempts. Please wait a few minutes." } };
  }
  if (!orderIdOk(orderId)) return { ok: false, status: 404, body: { error: "That order could not be found." } };

  const store = await getStore();
  const order = await store?.findByOrderId(orderId);
  if (!order || !canVerify(order, input)) {
    return { ok: false, status: 404, body: { error: "That confirmation link is not valid." } };
  }

  const saved = await store?.confirmPending(orderId, new Date().toISOString());
  if (!saved) return { ok: false, status: 404, body: { error: "That order could not be found." } };

  let sent = false;
  const confirmation = buildConfirmationMessage(messageInput(saved.order));
  if (saved.changed) {
    const notice = await notifyOwner(confirmation);
    sent = notice.sent;
  }

  return {
    ok: true,
    status: 200,
    body: {
      orderId: saved.order.orderId,
      status: saved.order.status,
      whatsapp: { sent, manualUrl: manualUrlFor(confirmation) },
    },
  };
}

export async function previewForVerify(orderId: string, verifyToken: string): Promise<DeskOrder | null> {
  if (!orderIdOk(orderId) || !verifyToken) return null;
  const store = await getStore();
  const order = await store?.findByOrderId(orderId);
  if (!order || !sameSecret(order.verifyToken, verifyToken)) return null;
  return deskOrder(order);
}

export async function listDeskOrders(ownerKey: string): Promise<{ ok: true; orders: DeskOrder[] } | { ok: false; status: number }> {
  if (!ownerMatches(ownerKey)) return { ok: false, status: 401 };
  const store = await getStore();
  if (!store) return { ok: false, status: 503 };
  const orders = await store.listRecent(40);
  return { ok: true, orders: orders.map(deskOrder) };
}

function canVerify(order: StoredOrder, input: { verifyToken?: string; ownerKey?: string }) {
  if (input.verifyToken && sameSecret(order.verifyToken, input.verifyToken)) return true;
  return ownerMatches(input.ownerKey ?? "");
}

function ownerMatches(ownerKey: string) {
  const expected = configuredOwnerKey();
  return expected !== "" && sameSecret(expected, ownerKey);
}

function deskOrder(order: StoredOrder): DeskOrder {
  return {
    orderId: order.orderId,
    customerName: order.customerName,
    mobile: order.mobile,
    productName: order.productName,
    ingredients: order.ingredients.map((ingredient) => ingredient.name),
    instructions: order.instructions,
    quantity: order.quantity || 1,
    total: order.total,
    status: order.status === "confirmed" ? "confirmed" : "pending_payment",
    paymentReference: order.paymentReference || "",
    dateLabel: order.dateLabel,
    timeLabel: order.timeLabel,
  };
}

function templateParameters(order: StoredOrder, verifyUrl: string) {
  return [
    `#${order.orderId}`,
    "Pending Payment",
    order.customerName,
    order.mobile,
    order.productName,
    String(order.quantity || 1),
    order.ingredients.map((item) => item.name).join(", "),
    order.instructions || "None",
    formatInr(order.total),
    order.dateLabel,
    order.timeLabel,
    verifyUrl || "-",
  ];
}
