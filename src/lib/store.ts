import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Collection, type Db, type Document } from "mongodb";

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
  pickupMinutes: number;
  pickupLabel: string;
  basePrice: number;
  toppingsTotal: number;
  total: number;
  currency: "INR";
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

type OrderStore = {
  findByIdempotency(key: string): Promise<StoredOrder | null>;
  findRecentSignature(signature: string, sinceIso: string): Promise<StoredOrder | null>;
  countRecentMobile(mobile: string, sinceIso: string): Promise<number>;
  insert(order: OrderDraft): Promise<InsertResult>;
  updateMessage(orderId: string, message: string): Promise<void>;
  updateWhatsApp(orderId: string, whatsapp: WhatsAppState): Promise<void>;
};

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
      return data.orders.find((order) => order.idempotencyKey === key) ?? null;
    });
  }

  findRecentSignature(signature: string, sinceIso: string) {
    return lock(async () => {
      const data = await readFileStore();
      return (
        data.orders.find((order) => order.signature === signature && order.createdAt >= sinceIso) ?? null
      );
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
      const order: StoredOrder = { ...draft, orderId: `BF${String(seq).padStart(4, "0")}` };
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
  return order as StoredOrder;
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
