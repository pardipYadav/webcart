import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Collection, type Db, type Document } from "mongodb";

import type { OrderStatus } from "@/lib/types";

export type WhatsAppState = {
  sent: boolean;
  mode: "api" | "manual" | "failed";
};

export type StoredOrder = {
  orderId: string;
  idempotencyKey: string;
  customerName: string;
  mobile: string;
  productId: string;
  productName: string;
  ingredients: { id: string; name: string; price: number }[];
  instructions: string;
  quantity: number;
  basePrice: number;
  toppingsTotal: number;
  total: number;
  currency: "INR";
  status: OrderStatus;
  accessToken: string;
  verifyToken: string;
  paymentReference: string;
  paymentSubmittedAt: string | null;
  paymentNotified: boolean;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewayQrId: string;
  qrImageUrl: string;
  confirmedAt: string | null;
  dateLabel: string;
  timeLabel: string;
  timeZone: "Asia/Kolkata";
  signature: string;
  message: string;
  createdAt: string;
  whatsapp: WhatsAppState;
};

export type OrderDraft = Omit<StoredOrder, "orderId">;

export type InsertResult = {
  order: StoredOrder;
  created: boolean;
};

type PaymentSave = {
  order: StoredOrder;
  changed: boolean;
};

type OrderStore = {
  findByIdempotency(key: string): Promise<StoredOrder | null>;
  findByOrderId(orderId: string): Promise<StoredOrder | null>;
  findRecentSignature(signature: string, sinceIso: string): Promise<StoredOrder | null>;
  countRecentMobile(mobile: string, sinceIso: string): Promise<number>;
  listRecent(limit: number): Promise<StoredOrder[]>;
  insert(order: OrderDraft): Promise<InsertResult>;
  updateMessage(orderId: string, message: string): Promise<void>;
  updateWhatsApp(orderId: string, whatsapp: WhatsAppState): Promise<void>;
  savePayment(orderId: string, reference: string, submittedAt: string): Promise<PaymentSave | null>;
  markPaymentNotified(orderId: string): Promise<void>;
  confirmPending(orderId: string, confirmedAt: string): Promise<PaymentSave | null>;
  attachGateway(orderId: string, gatewayOrderId: string): Promise<string>;
  attachQr(orderId: string, qrId: string, imageUrl: string): Promise<{ qrId: string; imageUrl: string }>;
  confirmWithPayment(orderId: string, paymentId: string, confirmedAt: string): Promise<PaymentSave | "conflict" | null>;
};

function normalize(order: StoredOrder): StoredOrder {
  return {
    ...order,
    quantity: order.quantity || 1,
    status: order.status === "confirmed" ? "confirmed" : "pending_payment",
    accessToken: order.accessToken || "",
    verifyToken: order.verifyToken || "",
    paymentReference: order.paymentReference || "",
    paymentSubmittedAt: order.paymentSubmittedAt ?? null,
    paymentNotified: order.paymentNotified === true,
    gatewayOrderId: order.gatewayOrderId || "",
    gatewayPaymentId: order.gatewayPaymentId || "",
    gatewayQrId: order.gatewayQrId || "",
    qrImageUrl: order.qrImageUrl || "",
    confirmedAt: order.confirmedAt ?? null,
  };
}

type FileData = {
  seq: number;
  orders: StoredOrder[];
};

function filePath() {
  return process.env.ORDER_DATA_PATH || path.join(process.cwd(), "data", "orders.json");
}

let tail: Promise<unknown> = Promise.resolve();

function lock<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readFileStore(): Promise<FileData> {
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ filePath(), "utf8");
    const parsed = JSON.parse(raw) as FileData;
    if (!parsed || !Array.isArray(parsed.orders) || typeof parsed.seq !== "number") {
      throw new Error("Order file is unreadable");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { seq: 0, orders: [] };
    }
    throw error;
  }
}

async function writeFileStore(data: FileData) {
  const destination = filePath();
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ destination, JSON.stringify(data, null, 2));
}

class FileOrderStore implements OrderStore {
  findByIdempotency(key: string) {
    return lock(async () => {
      const data = await readFileStore();
      const found = data.orders.find((order) => order.idempotencyKey === key);
      return found ? normalize(found) : null;
    });
  }

  findRecentSignature(signature: string, sinceIso: string) {
    return lock(async () => {
      const data = await readFileStore();
      const found = data.orders.find((order) => order.signature === signature && order.createdAt >= sinceIso);
      return found ? normalize(found) : null;
    });
  }

  countRecentMobile(mobile: string, sinceIso: string) {
    return lock(async () => {
      const data = await readFileStore();
      return data.orders.filter((order) => order.mobile === mobile && order.createdAt >= sinceIso).length;
    });
  }

  insert(draft: OrderDraft) {
    return lock(async () => {
      const data = await readFileStore();
      const existing = data.orders.find((order) => order.idempotencyKey === draft.idempotencyKey);
      if (existing) return { order: existing, created: false };
      const seq = data.seq + 1;
      const order = normalize({ ...draft, orderId: `BF${String(seq).padStart(4, "0")}` });
      data.seq = seq;
      data.orders.push(order);
      await writeFileStore(data);
      return { order, created: true };
    });
  }

  updateMessage(orderId: string, message: string) {
    return lock(async () => {
      const data = await readFileStore();
      const order = data.orders.find((item) => item.orderId === orderId);
      if (order) order.message = message;
      await writeFileStore(data);
    });
  }

  updateWhatsApp(orderId: string, whatsapp: WhatsAppState) {
    return lock(async () => {
      const data = await readFileStore();
      const order = data.orders.find((item) => item.orderId === orderId);
      if (order) order.whatsapp = whatsapp;
      await writeFileStore(data);
    });
  }

  findByOrderId(orderId: string) {
    return lock(async () => {
      const data = await readFileStore();
      const found = data.orders.find((order) => order.orderId === orderId);
      return found ? normalize(found) : null;
    });
  }

  listRecent(limit: number) {
    return lock(async () => {
      const data = await readFileStore();
      return data.orders
        .map((order) => normalize(order))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    });
  }

  savePayment(orderId: string, reference: string, submittedAt: string) {
    return lock(async () => {
      const data = await readFileStore();
      const order = data.orders.find((item) => item.orderId === orderId);
      if (!order || order.status === "confirmed") return order ? { order: normalize(order), changed: false } : null;
      const changed = order.paymentReference !== reference;
      order.paymentReference = reference;
      order.paymentSubmittedAt = submittedAt;
      if (changed) order.paymentNotified = false;
      await writeFileStore(data);
      return { order: normalize(order), changed };
    });
  }

  markPaymentNotified(orderId: string) {
    return lock(async () => {
      const data = await readFileStore();
      const order = data.orders.find((item) => item.orderId === orderId);
      if (order) order.paymentNotified = true;
      await writeFileStore(data);
    });
  }

  confirmPending(orderId: string, confirmedAt: string) {
    return lock(async () => {
      const data = await readFileStore();
      const order = data.orders.find((item) => item.orderId === orderId);
      if (!order) return null;
      if (order.status === "confirmed") return { order: normalize(order), changed: false };
      order.status = "confirmed";
      order.confirmedAt = confirmedAt;
      await writeFileStore(data);
      return { order: normalize(order), changed: true };
    });
  }

  attachGateway(orderId: string, gatewayOrderId: string) {
    return lock(async () => {
      const data = await readFileStore();
      const order = data.orders.find((item) => item.orderId === orderId);
      if (!order) return gatewayOrderId;
      if (!order.gatewayOrderId) order.gatewayOrderId = gatewayOrderId;
      await writeFileStore(data);
      return order.gatewayOrderId;
    });
  }

  attachQr(orderId: string, qrId: string, imageUrl: string) {
    return lock(async () => {
      const data = await readFileStore();
      const order = data.orders.find((item) => item.orderId === orderId);
      if (!order) return { qrId, imageUrl };
      if (!order.gatewayQrId) {
        order.gatewayQrId = qrId;
        order.qrImageUrl = imageUrl;
      }
      await writeFileStore(data);
      return { qrId: order.gatewayQrId, imageUrl: order.qrImageUrl };
    });
  }

  confirmWithPayment(orderId: string, paymentId: string, confirmedAt: string) {
    return lock(async () => {
      const data = await readFileStore();
      const usedElsewhere = data.orders.find((item) => item.gatewayPaymentId === paymentId && item.orderId !== orderId);
      if (usedElsewhere) return "conflict" as const;
      const order = data.orders.find((item) => item.orderId === orderId);
      if (!order) return null;
      if (order.status === "confirmed") {
        if (order.gatewayPaymentId && order.gatewayPaymentId !== paymentId) return "conflict" as const;
        return { order: normalize(order), changed: false };
      }
      order.status = "confirmed";
      order.confirmedAt = confirmedAt;
      order.gatewayPaymentId = paymentId;
      order.paymentReference = paymentId;
      await writeFileStore(data);
      return { order: normalize(order), changed: true };
    });
  }
}

function isDuplicateKey(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}

function readSeq(result: unknown) {
  if (!result || typeof result !== "object") return Number.NaN;
  if ("seq" in result && typeof result.seq === "number") return result.seq;
  if ("value" in result && result.value && typeof result.value === "object" && "seq" in result.value) {
    const seq = result.value.seq;
    return typeof seq === "number" ? seq : Number.NaN;
  }
  return Number.NaN;
}

function withoutId(document: Document): StoredOrder {
  const { _id: _ignored, ...order } = document;
  return normalize(order as StoredOrder);
}

class MongoOrderStore implements OrderStore {
  private orders: Collection<StoredOrder>;
  private counters: Collection<{ _id: string; seq: number }>;
  private ready: Promise<void>;

  constructor(db: Db) {
    this.orders = db.collection<StoredOrder>("orders");
    this.counters = db.collection("counters");
    this.ready = this.orders
      .createIndexes([
        { key: { idempotencyKey: 1 }, unique: true, name: "idempotencyKey_unique" },
        { key: { orderId: 1 }, unique: true, name: "orderId_unique" },
        { key: { mobile: 1, createdAt: 1 }, name: "mobile_createdAt" },
        { key: { signature: 1, createdAt: 1 }, name: "signature_createdAt" },
        {
          key: { gatewayPaymentId: 1 },
          unique: true,
          name: "gatewayPaymentId_unique",
          partialFilterExpression: { gatewayPaymentId: { $gt: "" } },
        },
      ])
      .then(() => undefined)
      .catch(() => {
        console.error("[orders] index setup failed");
      });
  }

  private async init() {
    await this.ready;
  }

  async findByIdempotency(key: string) {
    await this.init();
    const found = await this.orders.findOne({ idempotencyKey: key });
    return found ? withoutId(found) : null;
  }

  async findRecentSignature(signature: string, sinceIso: string) {
    await this.init();
    const found = await this.orders.findOne({ signature, createdAt: { $gte: sinceIso } });
    return found ? withoutId(found) : null;
  }

  async countRecentMobile(mobile: string, sinceIso: string) {
    await this.init();
    return this.orders.countDocuments({ mobile, createdAt: { $gte: sinceIso } });
  }

  async insert(draft: OrderDraft): Promise<InsertResult> {
    await this.init();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const updated = await this.counters.findOneAndUpdate(
        { _id: "order" },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" },
      );
      const seq = readSeq(updated);
      if (!Number.isFinite(seq)) throw new Error("Could not allocate an order id");
      const order: StoredOrder = { ...draft, orderId: `BF${String(seq).padStart(4, "0")}` };
      try {
        await this.orders.insertOne(order);
        return { order, created: true };
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const existing = await this.orders.findOne({ idempotencyKey: draft.idempotencyKey });
        if (existing) return { order: withoutId(existing), created: false };
      }
    }
    throw new Error("Could not save the order");
  }

  async updateMessage(orderId: string, message: string) {
    await this.init();
    await this.orders.updateOne({ orderId }, { $set: { message } });
  }

  async updateWhatsApp(orderId: string, whatsapp: WhatsAppState) {
    await this.init();
    await this.orders.updateOne({ orderId }, { $set: { whatsapp } });
  }

  async findByOrderId(orderId: string) {
    await this.init();
    const found = await this.orders.findOne({ orderId });
    return found ? withoutId(found) : null;
  }

  async listRecent(limit: number) {
    await this.init();
    const found = await this.orders.find({}, { sort: { createdAt: -1 }, limit }).toArray();
    return found.map((order) => withoutId(order));
  }

  async savePayment(orderId: string, reference: string, submittedAt: string) {
    await this.init();
    const current = await this.findByOrderId(orderId);
    if (!current) return null;
    if (current.status === "confirmed" || current.paymentReference === reference) {
      return { order: current, changed: false };
    }
    await this.orders.updateOne(
      { orderId, status: "pending_payment" },
      { $set: { paymentReference: reference, paymentSubmittedAt: submittedAt, paymentNotified: false } },
    );
    const saved = await this.findByOrderId(orderId);
    return saved ? { order: saved, changed: saved.paymentReference === reference } : null;
  }

  async markPaymentNotified(orderId: string) {
    await this.init();
    await this.orders.updateOne({ orderId }, { $set: { paymentNotified: true } });
  }

  async confirmPending(orderId: string, confirmedAt: string) {
    await this.init();
    const updated = await this.orders.findOneAndUpdate(
      { orderId, status: "pending_payment" },
      { $set: { status: "confirmed", confirmedAt } },
      { returnDocument: "after" },
    );
    if (updated) return { order: withoutId(updated), changed: true };
    const current = await this.findByOrderId(orderId);
    return current ? { order: current, changed: false } : null;
  }

  async attachQr(orderId: string, qrId: string, imageUrl: string) {
    await this.init();
    const updated = await this.orders.findOneAndUpdate(
      { orderId, status: "pending_payment", $or: [{ gatewayQrId: "" }, { gatewayQrId: { $exists: false } }] },
      { $set: { gatewayQrId: qrId, qrImageUrl: imageUrl } },
      { returnDocument: "after" },
    );
    if (updated) {
      const saved = withoutId(updated);
      return { qrId: saved.gatewayQrId, imageUrl: saved.qrImageUrl };
    }
    const current = await this.findByOrderId(orderId);
    return { qrId: current?.gatewayQrId || qrId, imageUrl: current?.qrImageUrl || imageUrl };
  }

  async attachGateway(orderId: string, gatewayOrderId: string) {
    await this.init();
    const updated = await this.orders.findOneAndUpdate(
      { orderId, status: "pending_payment", $or: [{ gatewayOrderId: "" }, { gatewayOrderId: { $exists: false } }] },
      { $set: { gatewayOrderId } },
      { returnDocument: "after" },
    );
    if (updated) return withoutId(updated).gatewayOrderId;
    const current = await this.findByOrderId(orderId);
    return current?.gatewayOrderId || gatewayOrderId;
  }

  async confirmWithPayment(orderId: string, paymentId: string, confirmedAt: string) {
    await this.init();
    if (!paymentId) return null;
    const other = await this.orders.findOne({ gatewayPaymentId: paymentId, orderId: { $ne: orderId } });
    if (other) return "conflict" as const;
    try {
      const updated = await this.orders.findOneAndUpdate(
        { orderId, status: "pending_payment" },
        { $set: { status: "confirmed", confirmedAt, gatewayPaymentId: paymentId, paymentReference: paymentId } },
        { returnDocument: "after" },
      );
      if (updated) return { order: withoutId(updated), changed: true };
    } catch (error) {
      if (isDuplicateKey(error)) return "conflict" as const;
      throw error;
    }
    const current = await this.findByOrderId(orderId);
    if (!current) return null;
    if (current.status === "confirmed" && (!current.gatewayPaymentId || current.gatewayPaymentId === paymentId)) {
      return { order: current, changed: false };
    }
    return "conflict" as const;
  }
}

let fileStore: FileOrderStore | null = null;
let mongoStore: MongoOrderStore | null = null;

export async function getStore(): Promise<OrderStore | null> {
  if (process.env.MONGODB_URI?.trim()) {
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    if (!db) return null;
    mongoStore ??= new MongoOrderStore(db);
    return mongoStore;
  }

  if (process.env.NODE_ENV === "production") return null;
  fileStore ??= new FileOrderStore();
  return fileStore;
}
