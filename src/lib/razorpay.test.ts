import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  paymentConfirmsOrder,
  readPaymentClaim,
  signPaymentClaim,
  signatureMatches,
  webhookSignatureMatches,
  type PaymentClaim,
} from "./razorpay";

const claim: PaymentClaim = {
  orderId: "BF0001",
  customerName: "Rahul Sharma",
  mobile: "9876501234",
  productName: "Oats Bowl",
  ingredients: [{ id: "oats", name: "Oats", price: 0 }],
  instructions: "",
  quantity: 1,
  total: 79,
  dateLabel: "09 October 2026",
  timeLabel: "08:15 AM",
  gatewayOrderId: "order_abc123",
  accessToken: "access-token-value",
};

test("a payment confirms only the matching captured order", () => {
  const payment = {
    id: "pay_abc123",
    orderId: "order_abc123",
    amountPaise: 7900,
    currency: "INR",
    status: "captured",
    breakfastOrderId: "BF0001",
  };
  const expected = { breakfastOrderId: "BF0001", gatewayOrderId: "order_abc123", amountPaise: 7900 };
  assert.equal(paymentConfirmsOrder(payment, expected), true);
  assert.equal(paymentConfirmsOrder({ ...payment, status: "failed" }, expected), false);
  assert.equal(paymentConfirmsOrder({ ...payment, status: "authorized" }, expected), false);
  assert.equal(paymentConfirmsOrder({ ...payment, amountPaise: 100 }, expected), false);
  assert.equal(paymentConfirmsOrder({ ...payment, orderId: "order_other" }, expected), false);
  assert.equal(paymentConfirmsOrder({ ...payment, breakfastOrderId: "BF0002" }, expected), false);
});

test("payment signatures and claims reject tampering", () => {
  const previous = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = "claim-secret";
  try {
    const secret = "top-secret";
    const signature = createHmac("sha256", secret).update("order_abc123|pay_abc123").digest("hex");
    assert.equal(signatureMatches("order_abc123", "pay_abc123", signature, secret), true);
    assert.equal(signatureMatches("order_abc123", "pay_other", signature, secret), false);

    const body = JSON.stringify({ event: "payment.captured" });
    const hook = createHmac("sha256", "hook-secret").update(body).digest("hex");
    assert.equal(webhookSignatureMatches(body, hook, "hook-secret"), true);
    assert.equal(webhookSignatureMatches(body, hook, "other-secret"), false);

    const token = signPaymentClaim(claim);
    assert.equal(readPaymentClaim(token)?.orderId, "BF0001");
    const splitAt = token.lastIndexOf(".");
    const tampered = `${token.slice(0, splitAt - 1)}A${token.slice(splitAt)}`;
    assert.equal(readPaymentClaim(tampered), null);
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previous;
  }
});
