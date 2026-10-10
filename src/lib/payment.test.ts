import assert from "node:assert/strict";
import test from "node:test";
import { paymentLinks } from "./payment";

test("the payment QR is a UPI code for this order and amount", () => {
  const links = paymentLinks("BF0010", 79, { upiId: "yadavpardeep213@oksbi", payeeName: "Pardeep Yadav" });
  assert.match(links.upiUrl, /^upi:\/\/pay\?/);
  assert.match(links.upiUrl, /pa=yadavpardeep213%40oksbi/);
  assert.match(links.upiUrl, /am=79\.00/);
  assert.match(links.upiUrl, /tr=BF0010/);
  assert.equal("apps" in links, false);
});
