import { createHmac, timingSafeEqual } from "node:crypto";

export type GatewayCheckout = {
  keyId: string;
  orderId: string;
  amountPaise: number;
};

export type GatewayPayment = {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: string;
  breakfastOrderId: string;
};

export type PaymentClaim = {
  orderId: string;
  customerName: string;
  mobile: string;
  productName: string;
  ingredients: { id: string; name: string; price: number }[];
  instructions: string;
  quantity: number;
  total: number;
  dateLabel: string;
  timeLabel: string;
  gatewayOrderId: string;
  accessToken: string;
};

export type GatewayOrder = {
  id: string;
  amountPaise: number;
  notes: Record<string, string>;
};

const ORDER_ID = /^order_[A-Za-z0-9]+$/;
const QR_ID = /^qr_[A-Za-z0-9]+$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;
const GATEWAY_ID = /^(?:order|qr)_[A-Za-z0-9]+$/;

export function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function amountPaise(rupees: number) {
  return Math.round(rupees * 100);
}

export function signatureMatches(gatewayOrderId: string, paymentId: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(`${gatewayOrderId}|${paymentId}`).digest("hex");
  return sameHex(expected, signature);
}

export function webhookSignatureMatches(body: string, signature: string, secret: string) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return sameHex(expected, signature);
}

export function qrPaymentConfirms(payment: GatewayPayment, amountPaise: number) {
  return payment.status === "captured" && payment.currency === "INR" && payment.amountPaise === amountPaise;
}

export function paymentConfirmsOrder(
  payment: GatewayPayment,
  expected: { breakfastOrderId: string; gatewayOrderId: string; amountPaise: number },
) {
  const notesMatch = !payment.breakfastOrderId || payment.breakfastOrderId === expected.breakfastOrderId;
  return (
    payment.status === "captured" &&
    payment.currency === "INR" &&
    payment.amountPaise === expected.amountPaise &&
    payment.orderId === expected.gatewayOrderId &&
    notesMatch
  );
}

export function signPaymentClaim(claim: PaymentClaim) {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!secret) return "";
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readPaymentClaim(token: string): PaymentClaim | null {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!secret) return null;
  const splitAt = token.lastIndexOf(".");
  if (splitAt <= 0) return null;
  const body = token.slice(0, splitAt);
  const signature = token.slice(splitAt + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length === 0 || left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PaymentClaim;
    if (!parsed || !/^BF\d{4,}$/.test(parsed.orderId)) return null;
    if (!GATEWAY_ID.test(parsed.gatewayOrderId)) return null;
    if (typeof parsed.total !== "number" || typeof parsed.accessToken !== "string") return null;
    if (!Array.isArray(parsed.ingredients)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createUpiQr(input: {
  breakfastOrderId: string;
  amountPaise: number;
  notes: Record<string, string>;
}) {
  const keys = razorpayKeys();
  if (!keys) return null;
  const body = await razorpayRequest("/payments/qr_codes", {
    method: "POST",
    body: JSON.stringify({
      type: "upi_qr",
      name: `Order ${input.breakfastOrderId}`.slice(0, 40),
      usage: "single_use",
      fixed_amount: true,
      payment_amount: input.amountPaise,
      description: `Breakfast ${input.breakfastOrderId}`.slice(0, 80),
      notes: { ...input.notes, breakfastOrderId: input.breakfastOrderId },
    }),
  });
  const record = asRecord(body);
  const id = stringField(record, "id");
  const imageUrl = stringField(record, "image_url");
  const amount = numberField(record, "payment_amount");
  if (!QR_ID.test(id) || !imageUrl.startsWith("https://") || amount !== input.amountPaise) return null;
  return { id, imageUrl, amountPaise: amount };
}

export async function fetchUpiQr(qrId: string): Promise<GatewayOrder | null> {
  if (!QR_ID.test(qrId)) return null;
  const body = await razorpayRequest(`/payments/qr_codes/${qrId}`);
  const record = asRecord(body);
  const id = stringField(record, "id");
  const amount = numberField(record, "payment_amount");
  if (!id || amount === null) return null;
  return { id, amountPaise: amount, notes: notesOf(record?.notes) };
}

export async function capturedPaymentForQr(qrId: string, breakfastOrderId: string, expectedPaise: number) {
  const remote = await fetchUpiQr(qrId);
  if (!remote || remote.amountPaise !== expectedPaise || remote.notes.breakfastOrderId !== breakfastOrderId) return null;
  const body = await razorpayRequest(`/payments/qr_codes/${qrId}/payments`);
  const items = asRecord(body)?.items;
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const payment = parsePayment(item);
    if (!payment) continue;
    const settled = await settlePayment(payment);
    if (settled && qrPaymentConfirms(settled, expectedPaise)) return settled;
  }
  return null;
}

export async function createGatewayOrder(input: {
  breakfastOrderId: string;
  amountPaise: number;
  notes: Record<string, string>;
}) {
  const keys = razorpayKeys();
  if (!keys) return null;
  const body = await razorpayRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.breakfastOrderId.slice(0, 40),
      notes: { ...input.notes, breakfastOrderId: input.breakfastOrderId },
    }),
  });
  const record = asRecord(body);
  const id = stringField(record, "id");
  const amount = numberField(record, "amount");
  if (!id || !ORDER_ID.test(id) || amount !== input.amountPaise) return null;
  return { keyId: keys.keyId, orderId: id, amountPaise: amount };
}

export async function fetchGatewayOrder(gatewayOrderId: string): Promise<GatewayOrder | null> {
  if (!ORDER_ID.test(gatewayOrderId)) return null;
  const body = await razorpayRequest(`/orders/${gatewayOrderId}`);
  const record = asRecord(body);
  const id = stringField(record, "id");
  const amount = numberField(record, "amount");
  if (!id || amount === null) return null;
  return { id, amountPaise: amount, notes: notesOf(record?.notes) };
}

export async function fetchGatewayPayment(paymentId: string): Promise<GatewayPayment | null> {
  if (!PAYMENT_ID.test(paymentId)) return null;
  const body = await razorpayRequest(`/payments/${paymentId}`);
  const payment = parsePayment(body);
  if (!payment) return null;
  return settlePayment(payment);
}

export async function capturedPaymentForOrder(gatewayOrderId: string, breakfastOrderId: string, expectedPaise: number) {
  const remote = await fetchGatewayOrder(gatewayOrderId);
  if (!remote || remote.amountPaise !== expectedPaise || remote.notes.breakfastOrderId !== breakfastOrderId) return null;
  const body = await razorpayRequest(`/orders/${gatewayOrderId}/payments`);
  const items = asRecord(body)?.items;
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const payment = parsePayment(item);
    if (!payment) continue;
    const settled = await settlePayment(payment);
    if (
      settled &&
      paymentConfirmsOrder(settled, {
        breakfastOrderId,
        gatewayOrderId,
        amountPaise: expectedPaise,
      })
    ) {
      return settled;
    }
  }
  return null;
}

export async function markGatewayNotified(gatewayOrderId: string, paymentId: string, notes: Record<string, string>) {
  const path = gatewayOrderId.startsWith("qr_") ? `/payments/qr_codes/${gatewayOrderId}` : `/orders/${gatewayOrderId}`;
  if (!GATEWAY_ID.test(gatewayOrderId)) return;
  await razorpayRequest(path, {
    method: "PATCH",
    body: JSON.stringify({
      notes: {
        ...notes,
        whatsappSent: "1",
        paymentId,
      },
    }),
  });
}

async function settlePayment(payment: GatewayPayment) {
  if (payment.status === "captured") return payment;
  if (payment.status !== "authorized") return payment;
  const body = await razorpayRequest(`/payments/${payment.id}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount: payment.amountPaise, currency: "INR" }),
  });
  return parsePayment(body) ?? payment;
}

async function razorpayRequest(path: string, init?: RequestInit) {
  const keys = razorpayKeys();
  if (!keys) return null;
  try {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function readGatewayPayment(value: unknown) {
  return parsePayment(value);
}

function parsePayment(value: unknown): GatewayPayment | null {
  const record = asRecord(value);
  const id = stringField(record, "id");
  const orderId = stringField(record, "order_id");
  const amountPaise = numberField(record, "amount");
  const currency = stringField(record, "currency");
  const status = stringField(record, "status");
  if (!id || !PAYMENT_ID.test(id) || amountPaise === null || !currency || !status) return null;
  if (orderId && !ORDER_ID.test(orderId)) return null;
  return {
    id,
    orderId,
    amountPaise,
    currency,
    status,
    breakfastOrderId: notesOf(record?.notes).breakfastOrderId ?? "",
  };
}

function notesOf(value: unknown) {
  const record = asRecord(value);
  const notes: Record<string, string> = {};
  if (!record) return notes;
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") notes[key] = item;
  }
  return notes;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function numberField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

function sameHex(left: string, right: string) {
  const a = Buffer.from(left.toLowerCase(), "hex");
  const b = Buffer.from(right.toLowerCase(), "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
