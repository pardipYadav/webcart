import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultProducts } from "../config/menu";
import { defaultMessages } from "../config/messages";
import { messageForDate } from "./health";
import { evaluateCart } from "./hours";
import { formatInr } from "./money";
import { buildWhatsAppMessage } from "./order-text";
import { confirmOrder, getCustomerOrder, placeOrder, submitPayment } from "./orders";
import { cleanName, normalizeMobile } from "./phone";
import { defaultSelection, isAllToppings, selectionState, withRequiredIngredients } from "./pricing";
import { formatOrderDate, formatOrderTime, zonedDateKey } from "./time";

const hours = {
  openTime: "07:00",
  closeTime: "11:30",
  timeZone: "Asia/Kolkata",
  prepMinutes: 15,
  forceOpen: false,
  forceClosed: false,
};

test("cart hours follow India time and include the closing minute", () => {
  assert.equal(evaluateCart(new Date("2026-10-09T01:29:00.000Z"), hours).open, false);
  assert.equal(evaluateCart(new Date("2026-10-09T01:30:00.000Z"), hours).open, true);
  assert.equal(evaluateCart(new Date("2026-10-09T06:00:00.000Z"), hours).open, true);
  assert.equal(evaluateCart(new Date("2026-10-09T06:01:00.000Z"), hours).open, false);
  assert.equal(evaluateCart(new Date("2026-10-09T06:01:00.000Z"), { ...hours, forceOpen: true }).open, true);
  assert.equal(
    evaluateCart(new Date("2026-10-09T02:00:00.000Z"), { ...hours, forceOpen: true, forceClosed: true }).open,
    false,
  );
});

test("the daily note stays the same through an India day", () => {
  const morning = new Date("2026-10-09T02:45:00.000Z");
  const evening = new Date("2026-10-09T16:00:00.000Z");
  const nextDay = new Date("2026-10-09T19:00:00.000Z");
  assert.equal(zonedDateKey(morning), "2026-10-09");
  assert.equal(zonedDateKey(evening), "2026-10-09");
  assert.equal(zonedDateKey(nextDay), "2026-10-10");
  assert.equal(messageForDate(defaultMessages, zonedDateKey(morning)), messageForDate(defaultMessages, zonedDateKey(evening)));
  assert.equal(formatOrderDate(morning), "09 October 2026");
  assert.equal(formatOrderTime(morning), "08:15 AM");
});

test("phone numbers and names are checked before an order is saved", () => {
  assert.equal(normalizeMobile("9876543210"), "9876543210");
  assert.equal(normalizeMobile("+91 98765-43210"), "9876543210");
  assert.equal(normalizeMobile("09876543210"), "9876543210");
  assert.equal(normalizeMobile("5876543210"), null);
  assert.equal(cleanName("  Rahul   Sharma "), "Rahul Sharma");
  assert.equal(cleanName("A"), null);
  assert.equal(cleanName("Rahul123"), null);
});

test("topping prices add to the base price and the all-toppings choice stays in sync", () => {
  const oats = defaultProducts[0];
  const base = selectionState(oats, defaultSelection(oats));
  assert.deepEqual(base.chosen.map((item) => item.name), ["Oats", "Hot Milk"]);
  assert.equal(base.total, 79);

  const withBanana = selectionState(oats, [...defaultSelection(oats), "banana"]);
  assert.equal(withBanana.total, 79);
  assert.deepEqual(
    selectionState(oats, withRequiredIngredients(oats, ["banana"])).chosen.map((item) => item.name),
    ["Oats", "Hot Milk", "Banana"],
  );

  const allIds = oats.ingredients.map((item) => item.id);
  assert.equal(isAllToppings(oats, allIds), true);
  assert.equal(isAllToppings(oats, defaultSelection(oats)), false);
  assert.equal(isAllToppings(oats, allIds.filter((id) => id !== "honey")), false);

  assert.equal(selectionState(oats, allIds).total, 79);
});

test("WhatsApp text includes the order the cart needs", () => {
  const text = buildWhatsAppMessage({
    orderId: "BF1025",
    customerName: "Rahul Sharma",
    mobile: "9876543210",
    productName: "Oats Bowl",
    ingredients: [
      { name: "Oats" },
      { name: "Hot Milk" },
      { name: "Pumpkin Seeds" },
      { name: "Chia Seeds" },
      { name: "Banana" },
    ],
    instructions: "No honey",
    quantity: 1,
    total: 79,
    dateLabel: "09 October 2026",
    timeLabel: "08:15 AM",
    payeeName: "Traverso",
    upiId: "name@okaxis",
  });

  assert.equal(
    text,
    [
      "*New Breakfast Order*",
      "",
      "Order ID: #BF1025",
      "Status: Pending Payment",
      "Customer Name: Rahul Sharma",
      "Mobile Number: 9876543210",
      "Product: Oats Bowl",
      "Quantity: 1",
      "Ingredients: Oats, Hot Milk, Pumpkin Seeds, Chia Seeds, Banana",
      "Special Instructions: No honey",
      `Total: ${formatInr(79)}`,
      "Order Date: 09 October 2026",
      "Order Time: 08:15 AM",
      "",
      "Payment: Google Pay",
      `Amount: ${formatInr(79)}`,
      "Payee: Traverso",
      "UPI ID: name@okaxis",
      "",
      "Please prepare this order after the payment is verified.",
    ].join("\n"),
  );

  const withLink = buildWhatsAppMessage({
    orderId: "BF1025",
    customerName: "Rahul Sharma",
    mobile: "9876543210",
    productName: "Oats Bowl",
    ingredients: [{ name: "Oats" }],
    instructions: "",
    quantity: 1,
    total: 79,
    dateLabel: "09 October 2026",
    timeLabel: "08:15 AM",
    verifyUrl: "https://cart.example/verify/BF1025?token=abc",
  });
  assert.match(withLink, /Verify payment: https:\/\/cart\.example\/verify\/BF1025\?token=abc/);
});

test("orders are saved without MongoDB and repeated taps do not create a second order", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "traverso-orders-"));
  const previous = {
    mongo: process.env.MONGODB_URI,
    forceOpen: process.env.CART_FORCE_OPEN,
    forceClosed: process.env.CART_FORCE_CLOSED,
    dataPath: process.env.ORDER_DATA_PATH,
    owner: process.env.WHATSAPP_OWNER_NUMBER,
    token: process.env.WHATSAPP_TOKEN,
    phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  };

  delete process.env.MONGODB_URI;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.ORDER_DATA_PATH = path.join(directory, "orders.json");
  process.env.WHATSAPP_OWNER_NUMBER = "919876543210";
  process.env.CART_FORCE_OPEN = "true";
  delete process.env.CART_FORCE_CLOSED;

  const mobile = "9876501234";
  const key = randomUUID();
  const payload = {
    idempotencyKey: key,
    customerName: "Rahul Sharma",
    mobile,
    productId: "oats-bowl",
    ingredientIds: ["oats", "hot-milk", "banana"],
    instructions: "No honey",
    website: "",
    startedAt: Date.now() - 5000,
  };

  try {
    const invalid = await placeOrder({ ...payload, idempotencyKey: randomUUID(), mobile: "12345" }, "ip-invalid");
    assert.equal(invalid.ok, false);

    const first = await placeOrder(payload, "ip-order");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.body.order.orderId, "BF0001");
    assert.equal(first.body.order.total, 79);
    assert.equal(first.body.whatsapp.sent, false);
    assert.ok(first.body.whatsapp.manualUrl?.includes("wa.me/919876543210"));
    assert.match(first.body.whatsapp.manualUrl ?? "", /No%20honey|No\+honey|No%20honey/);

    const saved = JSON.parse(await readFile(process.env.ORDER_DATA_PATH, "utf8")) as {
      orders: { message: string; whatsapp: { sent: boolean } }[];
    };
    assert.equal(saved.orders.length, 1);
    assert.match(saved.orders[0].message, /Order ID: #BF0001/);
    assert.match(saved.orders[0].message, /Status: Pending Payment/);
    assert.match(saved.orders[0].message, /Quantity: 1/);
    assert.match(saved.orders[0].message, /Customer Name: Rahul Sharma/);
    assert.match(saved.orders[0].message, /Please prepare this order after the payment is verified\./);
    assert.doesNotMatch(saved.orders[0].message, /Verify payment/);
    assert.equal(saved.orders[0].whatsapp.sent, false);

    const repeat = await placeOrder(payload, "ip-order-repeat");
    assert.equal(repeat.ok, true);
    if (repeat.ok) assert.equal(repeat.body.order.orderId, "BF0001");

    const sameBowl = await placeOrder({ ...payload, idempotencyKey: randomUUID() }, "ip-order-same");
    assert.equal(sameBowl.ok, true);
    if (sameBowl.ok) assert.equal(sameBowl.body.order.orderId, "BF0001");

    const changed = await placeOrder(
      { ...payload, idempotencyKey: randomUUID(), ingredientIds: ["oats", "hot-milk", "honey"] },
      "ip-order-changed",
    );
    assert.equal(changed.ok, true);
    if (changed.ok) {
      assert.equal(changed.body.order.orderId, "BF0002");
      assert.equal(changed.body.order.total, 79);
    }

    assert.equal(first.body.order.status, "pending_payment");
    assert.equal(first.body.order.quantity, 1);
    const rejected = await submitPayment(
      first.body.order.orderId,
      { accessToken: first.body.accessToken, reference: "12" },
      "ip-pay-bad",
    );
    assert.equal(rejected.ok, false);

    const paid = await submitPayment(
      first.body.order.orderId,
      { accessToken: first.body.accessToken, reference: "1234 5678 9012" },
      "ip-pay",
    );
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    assert.equal(paid.body.order.status, "pending_payment");
    assert.equal(paid.body.order.paymentReference, "123456789012");

    const stored = JSON.parse(await readFile(process.env.ORDER_DATA_PATH, "utf8")) as {
      orders: { orderId: string; verifyToken: string }[];
    };
    const verifyToken = stored.orders.find((item) => item.orderId === "BF0001")?.verifyToken ?? "";
    const wrong = await confirmOrder("BF0001", { verifyToken: "not-the-token" }, "ip-confirm-wrong");
    assert.equal(wrong.ok, false);

    const confirmed = await confirmOrder("BF0001", { verifyToken }, "ip-confirm");
    assert.equal(confirmed.ok, true);
    if (confirmed.ok) assert.equal(confirmed.body.status, "confirmed");

    const viewed = await getCustomerOrder("BF0001", first.body.accessToken, "ip-view");
    assert.equal(viewed.ok, true);
    if (viewed.ok) assert.equal(viewed.body.order.status, "confirmed");
  } finally {
    restoreEnv("MONGODB_URI", previous.mongo);
    restoreEnv("CART_FORCE_OPEN", previous.forceOpen);
    restoreEnv("CART_FORCE_CLOSED", previous.forceClosed);
    restoreEnv("ORDER_DATA_PATH", previous.dataPath);
    restoreEnv("WHATSAPP_OWNER_NUMBER", previous.owner);
    restoreEnv("WHATSAPP_TOKEN", previous.token);
    restoreEnv("WHATSAPP_PHONE_NUMBER_ID", previous.phoneId);
    await rm(directory, { recursive: true, force: true });
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
