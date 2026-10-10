import { timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { paymentConfig } from "@/config/payment";
import type { UpiAppLink } from "@/lib/types";

export type PaymentAccount = {
  upiId: string;
  payeeName: string;
};

export function isUpiId(value: string) {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(value);
}

export function paymentAccount(): PaymentAccount | null {
  const upiId = (process.env.UPI_ID?.trim() || paymentConfig.upiId).trim();
  const payeeName = (process.env.UPI_PAYEE_NAME?.trim() || paymentConfig.payeeName).trim() || "Traverso";
  if (!isUpiId(upiId)) return null;
  return { upiId, payeeName };
}

const upiApps = [
  { id: "gpay", name: "Google Pay", androidPackage: "com.google.android.apps.nbu.paisa.user", iosScheme: "gpay://upi/pay?" },
  { id: "phonepe", name: "PhonePe", androidPackage: "com.phonepe.app", iosScheme: "phonepe://pay?" },
  { id: "paytm", name: "Paytm", androidPackage: "net.one97.paytm", iosScheme: "paytmmp://pay?" },
] as const;

function androidIntent(query: string, androidPackage: string) {
  return `intent://pay?${query}#Intent;scheme=upi;package=${androidPackage};end`;
}

export function paymentLinks(orderId: string, amount: number, account: PaymentAccount) {
  const query = new URLSearchParams({
    pa: account.upiId,
    pn: account.payeeName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: `Breakfast ${orderId}`.slice(0, 50),
    tr: orderId.slice(0, 35),
  }).toString();
  const apps: UpiAppLink[] = upiApps.map((app) => ({
    id: app.id,
    name: app.name,
    androidUrl: androidIntent(query, app.androidPackage),
    iosUrl: `${app.iosScheme}${query}`,
  }));
  return {
    payeeName: account.payeeName,
    upiId: account.upiId,
    upiUrl: `upi://pay?${query}`,
    gpayUrl: apps[0]?.androidUrl ?? `upi://pay?${query}`,
    apps,
  };
}

export async function paymentDetails(orderId: string, amount: number, account: PaymentAccount) {
  const links = paymentLinks(orderId, amount, account);
  const qrDataUrl = await QRCode.toDataURL(links.upiUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 480,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  return { ...links, qrDataUrl };
}

export function cleanPaymentReference(value: string) {
  const clean = value.trim().replace(/[\s-]+/g, "");
  if (!/^[A-Za-z0-9]{6,30}$/.test(clean)) return null;
  return clean.toUpperCase();
}

export function configuredOwnerKey() {
  const key = process.env.OWNER_KEY?.trim() ?? "";
  return key.length >= 8 ? key : "";
}

export function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requestOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const forwarded = request.headers.get("x-forwarded-proto");
  const proto = forwarded || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
