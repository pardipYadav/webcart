import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getCartStatus } from "@/lib/cart-status";
import { getMenu } from "@/lib/catalog";
import { formatInr } from "@/lib/money";
import { buildConfirmationMessage, buildPaymentMessage, type OrderMessageInput } from "@/lib/order-text";
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
import {
  amountPaise,
  capturedPaymentForOrder,
  capturedPaymentForQr,
  createUpiQr,
  fetchGatewayOrder,
  fetchGatewayPayment,
  fetchUpiQr,
  markGatewayNotified,
  paymentConfirmsOrder,
  qrPaymentConfirms,
  razorpayKeys,
  readGatewayPayment,
  readPaymentClaim,
  signPaymentClaim,
  signatureMatches,
  webhookSignatureMatches,
  type GatewayPayment,
  type PaymentClaim,
} from "@/lib/razorpay";
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

const verifySchema = z.object({
  accessToken: z.string().min(16).max(80),
  razorpayOrderId: z.string().max(50).optional(),
  razorpayPaymentId: z.string().max(50).optional(),
  razorpaySignature: z.string().max(128).optional(),
  paymentClaim: z.string().max(8000).optional(),
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

async function paymentFor(order: StoredOrder) {
  if (order.status === "confirmed") return null;
  const account = paymentAccount();
  if (order.qrImageUrl) return { payeeName: account?.payeeName || "Pardeep Yadav", qrDataUrl: order.qrImageUrl };
  if (!account) return null;
  return paymentDetails(order.orderId, order.total, account);
}

async function present(order: StoredOrder): Promise<OrderResponse> {
  const confirmed = order.status === "confirmed";
  const confirmation = confirmed ? buildConfirmationMessage(messageInput(order)) : "";
  const gatewayId = order.gatewayQrId || order.gatewayOrderId;
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
      status: confirmed ? "confirmed" : "pending_payment",
      paymentReference: order.paymentReference || "",
      payment: await paymentFor(order),
      dateLabel: order.dateLabel,
      timeLabel: order.timeLabel,
    },
    accessToken: order.accessToken,
    checkout: null,
    paymentClaim: !confirmed && gatewayId ? signPaymentClaim({ ...claimFrom(order), gatewayOrderId: gatewayId }) : "",
    whatsapp: {
      sent: confirmed && order.whatsapp.sent,
      manualUrl: confirmed ? manualUrlFor(order.message.includes("Status: Confirmed") ? order.message : confirmation) : null,
      orderPhone: orderPhoneLabel(),
    },
    paymentWhatsapp: null,
  };
}

async function sendConfirmation(order: StoredOrder) {
  const confirmation = buildConfirmationMessage(messageInput(order));
  order.message = confirmation;
  const notice = await notifyOwner(confirmation, templateParameters(order, "Confirmed"));
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
      gatewayOrderId: "",
      gatewayPaymentId: "",
      gatewayQrId: "",
      qrImageUrl: "",
      confirmedAt: null,
      dateLabel: formatOrderDate(now),
      timeLabel: formatOrderTime(now),
      timeZone: INDIA_TIME_ZONE,
      signature: "",
      createdAt: now.toISOString(),
      whatsapp: { sent: false, mode: "manual" },
      message: "",
    };
    await ensureGateway(order);
    return { ok: true, status: 200, body: await present(order) };
  }

  const existing = await store.findByIdempotency(input.idempotencyKey);
  if (existing) {
    await ensureGateway(existing);
    return { ok: true, status: 200, body: await present(existing) };
  }

  const instructions = cleanInstructions(input.instructions ?? "");
  const signature = [product.id, selection.chosen.map((item) => item.id).join(","), instructions].join("|");
  const since = new Date(Date.now() - 45_000).toISOString();
  const duplicate = await store.findRecentSignature(`${mobile}|${signature}`, since);
  if (duplicate) {
    await ensureGateway(duplicate);
    return { ok: true, status: 200, body: await present(duplicate) };
  }

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
    gatewayOrderId: "",
    gatewayPaymentId: "",
    gatewayQrId: "",
    qrImageUrl: "",
    confirmedAt: null,
    dateLabel: formatOrderDate(now),
    timeLabel: formatOrderTime(now),
    timeZone: INDIA_TIME_ZONE,
    signature: `${mobile}|${signature}`,
    createdAt: now.toISOString(),
    whatsapp: { sent: false, mode: "manual" },
    message: "",
  });
  await ensureGateway(inserted.order);
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
  const fresh = await syncCapturedPayment(order);
  return { ok: true, status: 200, body: await present(fresh) };
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

  if (saved.changed || saved.order.whatsapp.mode === "failed") await sendConfirmation(saved.order);
  const confirmation = buildConfirmationMessage(messageInput(saved.order));

  return {
    ok: true,
    status: 200,
    body: {
      orderId: saved.order.orderId,
      status: saved.order.status,
      whatsapp: { sent: saved.order.whatsapp.sent, manualUrl: manualUrlFor(confirmation) },
    },
  };
}

export async function verifyOrderPayment(orderId: string, payload: unknown, ip: string): Promise<PlaceOrderResult> {
  if (!rateLimit(`verify:${ip}:${orderId}`, 20, 15 * 60 * 1000)) {
    return fail(429, "Too many attempts. Please wait a few minutes and try again.");
  }
  if (!orderIdOk(orderId)) return fail(404, "That order could not be found.");
  if (!razorpayKeys()) return fail(503, "Payment verification is not set up yet.");

  const parsed = verifySchema.safeParse(payload);
  if (!parsed.success) return fail(400, "The payment could not be checked.");

  const store = await getStore();
  const stored = await store?.findByOrderId(orderId);
  if (stored) {
    if (!sameSecret(stored.accessToken, parsed.data.accessToken)) return fail(404, "That order could not be found.");
    const gatewayId = stored.gatewayQrId || stored.gatewayOrderId;
    const payment = await paymentFromClient(stored.orderId, gatewayId, stored.total, parsed.data);
    if (payment === "failed") return fail(402, "The payment did not go through. This order is not confirmed.");
    if (payment === "mismatch") return fail(400, "This payment is not for this order.");
    if (payment === "incomplete") return fail(402, "The payment is not complete. This order is not confirmed.");
    if (!payment) return { ok: true, status: 200, body: await present(stored) };
    const applied = gatewayId.startsWith("qr_") ? await applyQrPayment(stored, payment) : await applyCapturedPayment(stored, payment);
    if (applied === "conflict") return fail(409, "This payment is already linked to another order.");
    return { ok: true, status: 200, body: await present(applied) };
  }

  const claim = parsed.data.paymentClaim ? readPaymentClaim(parsed.data.paymentClaim) : null;
  if (!claim || claim.orderId !== orderId || !sameSecret(claim.accessToken, parsed.data.accessToken)) {
    return fail(404, "That order could not be found.");
  }
  const payment = await paymentFromClient(claim.orderId, claim.gatewayOrderId, claim.total, parsed.data);
  if (payment === "failed") return fail(402, "The payment did not go through. This order is not confirmed.");
  if (payment === "mismatch") return fail(400, "This payment is not for this order.");
  if (payment === "incomplete") return fail(402, "The payment is not complete. This order is not confirmed.");
  const pending = orderFromClaim(claim);
  if (!payment) return { ok: true, status: 200, body: await present(pending) };
  return { ok: true, status: 200, body: await present(await confirmWithoutStore(pending, payment)) };
}

export async function handleRazorpayWebhook(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) return 503;
  if (!webhookSignatureMatches(rawBody, signature, secret)) return 400;
  let eventName = "";
  let entity: unknown = null;
  let qrEntity: unknown = null;
  try {
    const parsed = JSON.parse(rawBody) as {
      event?: string;
      payload?: { payment?: { entity?: unknown }; qr_code?: { entity?: unknown } };
    };
    eventName = parsed.event ?? "";
    entity = parsed.payload?.payment?.entity ?? null;
    qrEntity = parsed.payload?.qr_code?.entity ?? null;
  } catch {
    return 400;
  }
  if (eventName === "qr_code.credited") return confirmCreditedQr(entity, qrEntity);
  if (eventName !== "payment.captured") return 200;
  const payment = readGatewayPayment(entity);
  if (!payment || payment.status !== "captured") return 200;

  const remote = await fetchGatewayOrder(payment.orderId);
  const breakfastOrderId = remote?.notes.breakfastOrderId || payment.breakfastOrderId;
  if (!breakfastOrderId || !orderIdOk(breakfastOrderId)) return 200;

  const store = await getStore();
  if (!store) return process.env.MONGODB_URI?.trim() ? 503 : 200;
  const order = await store.findByOrderId(breakfastOrderId);
  if (!order || order.gatewayOrderId !== payment.orderId) return 200;
  if (!paymentConfirmsOrder(payment, { breakfastOrderId, gatewayOrderId: order.gatewayOrderId, amountPaise: amountPaise(order.total) })) {
    return 200;
  }
  await applyCapturedPayment(order, payment);
  return 200;
}

async function confirmCreditedQr(paymentEntity: unknown, qrEntity: unknown) {
  const payment = readGatewayPayment(paymentEntity);
  const qr = qrEntity && typeof qrEntity === "object" ? (qrEntity as { id?: unknown; notes?: unknown; payment_amount?: unknown }) : null;
  const qrId = typeof qr?.id === "string" ? qr.id : "";
  const notes = qr?.notes && typeof qr.notes === "object" ? (qr.notes as Record<string, unknown>) : {};
  const breakfastOrderId = typeof notes.breakfastOrderId === "string" ? notes.breakfastOrderId : "";
  const expectedPaise = typeof qr?.payment_amount === "number" ? qr.payment_amount : null;
  if (!payment || !qrId.startsWith("qr_") || !orderIdOk(breakfastOrderId) || expectedPaise === null) return 200;
  if (!qrPaymentConfirms(payment, expectedPaise)) return 200;

  const store = await getStore();
  if (!store) return process.env.MONGODB_URI?.trim() ? 503 : 200;
  const order = await store.findByOrderId(breakfastOrderId);
  if (!order || order.gatewayQrId !== qrId || amountPaise(order.total) !== expectedPaise) return 200;
  await applyQrPayment(order, payment);
  return 200;
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

function claimFrom(order: StoredOrder): PaymentClaim {
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
    gatewayOrderId: order.gatewayOrderId,
    accessToken: order.accessToken,
  };
}

function orderFromClaim(claim: PaymentClaim): StoredOrder {
  return {
    orderId: claim.orderId,
    idempotencyKey: "",
    customerName: claim.customerName,
    mobile: claim.mobile,
    productId: "",
    productName: claim.productName,
    ingredients: claim.ingredients,
    instructions: claim.instructions,
    quantity: claim.quantity || 1,
    basePrice: claim.total,
    toppingsTotal: 0,
    total: claim.total,
    currency: "INR",
    status: "pending_payment",
    accessToken: claim.accessToken,
    verifyToken: "",
    paymentReference: "",
    paymentSubmittedAt: null,
    paymentNotified: false,
    gatewayOrderId: claim.gatewayOrderId.startsWith("order_") ? claim.gatewayOrderId : "",
    gatewayPaymentId: "",
    gatewayQrId: claim.gatewayOrderId.startsWith("qr_") ? claim.gatewayOrderId : "",
    qrImageUrl: "",
    confirmedAt: null,
    dateLabel: claim.dateLabel,
    timeLabel: claim.timeLabel,
    timeZone: INDIA_TIME_ZONE,
    signature: "",
    message: "",
    createdAt: new Date().toISOString(),
    whatsapp: { sent: false, mode: "manual" },
  };
}

async function ensureGateway(order: StoredOrder) {
  if (order.status === "confirmed" || order.gatewayQrId || !razorpayKeys()) return order;
  const created = await createUpiQr({
    breakfastOrderId: order.orderId,
    amountPaise: amountPaise(order.total),
    notes: {
      customerName: order.customerName.slice(0, 60),
      mobile: order.mobile,
      productName: order.productName.slice(0, 80),
      total: String(amountPaise(order.total)),
    },
  });
  if (!created) return order;
  const store = await getStore();
  if (!store) {
    order.gatewayQrId = created.id;
    order.qrImageUrl = created.imageUrl;
    return order;
  }
  const saved = await store.attachQr(order.orderId, created.id, created.imageUrl);
  order.gatewayQrId = saved.qrId;
  order.qrImageUrl = saved.imageUrl;
  return order;
}

async function syncCapturedPayment(order: StoredOrder) {
  if (order.status === "confirmed" || !razorpayKeys()) return order;
  if (order.gatewayQrId) {
    const payment = await capturedPaymentForQr(order.gatewayQrId, order.orderId, amountPaise(order.total));
    if (!payment) return order;
    const applied = await applyQrPayment(order, payment);
    return applied === "conflict" ? order : applied;
  }
  if (!order.gatewayOrderId) return order;
  const payment = await capturedPaymentForOrder(order.gatewayOrderId, order.orderId, amountPaise(order.total));
  if (!payment) return order;
  const applied = await applyCapturedPayment(order, payment);
  return applied === "conflict" ? order : applied;
}

async function applyQrPayment(order: StoredOrder, payment: GatewayPayment): Promise<StoredOrder | "conflict"> {
  if (!qrPaymentConfirms(payment, amountPaise(order.total))) return order;
  const store = await getStore();
  if (!store) return confirmWithoutStore(order, payment);
  const saved = await store.confirmWithPayment(order.orderId, payment.id, new Date().toISOString());
  if (saved === "conflict" || !saved) return saved === "conflict" ? "conflict" : order;
  if (saved.changed || saved.order.whatsapp.mode === "failed") await sendConfirmation(saved.order);
  return saved.order;
}

async function applyCapturedPayment(order: StoredOrder, payment: GatewayPayment): Promise<StoredOrder | "conflict"> {
  if (!paymentConfirmsOrder(payment, { breakfastOrderId: order.orderId, gatewayOrderId: order.gatewayOrderId, amountPaise: amountPaise(order.total) })) {
    return order;
  }
  const store = await getStore();
  if (!store) return confirmWithoutStore(order, payment);
  const saved = await store.confirmWithPayment(order.orderId, payment.id, new Date().toISOString());
  if (saved === "conflict" || !saved) return saved === "conflict" ? "conflict" : order;
  if (saved.changed || saved.order.whatsapp.mode === "failed") await sendConfirmation(saved.order);
  return saved.order;
}

async function confirmWithoutStore(order: StoredOrder, payment: GatewayPayment) {
  const gatewayId = order.gatewayQrId || order.gatewayOrderId;
  const remote = gatewayId.startsWith("qr_") ? await fetchUpiQr(gatewayId) : await fetchGatewayOrder(gatewayId);
  const already = remote?.notes.whatsappSent === "1" && remote.notes.paymentId === payment.id;
  order.status = "confirmed";
  order.gatewayPaymentId = payment.id;
  order.paymentReference = payment.id;
  order.confirmedAt = new Date().toISOString();
  if (already) {
    order.message = buildConfirmationMessage(messageInput(order));
    order.whatsapp = { sent: true, mode: "api" };
    return order;
  }
  await sendConfirmation(order);
  await markGatewayNotified(gatewayId, payment.id, remote?.notes ?? { breakfastOrderId: order.orderId });
  return order;
}

async function paymentFromClient(
  breakfastOrderId: string,
  gatewayOrderId: string,
  total: number,
  input: { razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string },
): Promise<GatewayPayment | "failed" | "incomplete" | "mismatch" | null> {
  const keys = razorpayKeys();
  if (!keys || !gatewayOrderId) return "mismatch";
  if (gatewayOrderId.startsWith("qr_")) {
    return capturedPaymentForQr(gatewayOrderId, breakfastOrderId, amountPaise(total));
  }
  if (input.razorpayPaymentId) {
    if (!input.razorpayOrderId || !input.razorpaySignature) return "mismatch";
    if (input.razorpayOrderId !== gatewayOrderId) return "mismatch";
    if (!signatureMatches(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature, keys.keySecret)) {
      return "mismatch";
    }
    const payment = await fetchGatewayPayment(input.razorpayPaymentId);
    if (!payment) return "incomplete";
    if (payment.status === "failed") return "failed";
    if (!paymentConfirmsOrder(payment, { breakfastOrderId, gatewayOrderId, amountPaise: amountPaise(total) })) {
      return payment.status === "captured" ? "mismatch" : "incomplete";
    }
    return payment;
  }
  return capturedPaymentForOrder(gatewayOrderId, breakfastOrderId, amountPaise(total));
}

function templateParameters(order: StoredOrder, statusLabel: string) {
  return [
    `#${order.orderId}`,
    statusLabel,
    order.customerName,
    order.mobile,
    order.productName,
    String(order.quantity || 1),
    order.ingredients.map((item) => item.name).join(", "),
    order.instructions || "None",
    formatInr(order.total),
    order.dateLabel,
    order.timeLabel,
    "-",
  ];
}
