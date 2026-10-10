import assert from "node:assert/strict";
import test from "node:test";
import { paymentLinks } from "./payment";

test("checkout offers Google Pay, PhonePe, and Paytm for the same order", () => {
  const links = paymentLinks("BF0010", 79, { upiId: "yadavpardeep213@oksbi", payeeName: "Pardeep Yadav" });
  assert.deepEqual(
    links.apps.map((app) => app.name),
    ["Google Pay", "PhonePe", "Paytm"],
  );
  assert.match(links.apps[0].androidUrl, /com\.google\.android\.apps\.nbu\.paisa\.user/);
  assert.match(links.apps[1].androidUrl, /com\.phonepe\.app/);
  assert.match(links.apps[2].androidUrl, /net\.one97\.paytm/);
  assert.match(links.apps[1].iosUrl, /^phonepe:\/\/pay\?/);
  assert.match(links.apps[2].iosUrl, /^paytmmp:\/\/pay\?/);
  assert.match(links.upiUrl, /tr=BF0010/);
  assert.match(links.upiUrl, /am=79\.00/);
});
