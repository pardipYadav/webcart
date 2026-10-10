import assert from "node:assert/strict";
import test from "node:test";
import { paymentLinks } from "./payment";

test("the payment QR is a UPI code for this order and amount", () => {
  const links = paymentLinks("BF0010", 79, { upiId: "yadavpardeep213@oksbi", payeeName: "Pardeep Yadav" });
  assert.equal(
    links.upiUrl,
    "upi://pay?pa=yadavpardeep213@oksbi&pn=Pardeep%20Yadav&am=79.00&cu=INR&tn=Breakfast%20BF0010",
  );
});
