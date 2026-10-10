"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/money";
import { ORDER_STORAGE_KEY, type OrderResponse, type OrderStatus, type UpiAppLink } from "@/lib/types";

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckout = {
  open: () => void;
  on: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

function readOrder(): OrderResponse | null {
  const raw = sessionStorage.getItem(ORDER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OrderResponse;
    if (!parsed?.order?.orderId || !parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function statusLabel(status: OrderStatus) {
  return status === "confirmed" ? "Confirmed" : "Pending Payment";
}

type PayPlatform = "android" | "ios" | "desktop";

function appHref(app: UpiAppLink, upiUrl: string, platform: PayPlatform) {
  if (platform === "android") return app.androidUrl;
  if (platform === "ios") return app.iosUrl;
  return upiUrl;
}

export function ConfirmedView() {
  const [order, setOrder] = useState<OrderResponse | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<PayPlatform>("desktop");
  const [paying, setPaying] = useState(false);
  const [payNote, setPayNote] = useState("");

  useEffect(() => {
    const agent = navigator.userAgent;
    if (/Android/i.test(agent)) setPlatform("android");
    else if (/iPhone|iPad|iPod/i.test(agent)) setPlatform("ios");
    else setPlatform("desktop");
    setOrder(readOrder());
  }, []);

  const orderId = order?.order.orderId;
  const accessToken = order?.accessToken;
  const status = order?.order.status;

  useEffect(() => {
    if (!orderId || !accessToken || status === "confirmed" || status === undefined) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}?access=${encodeURIComponent(accessToken)}`);
        if (response.ok) {
          const body = (await response.json()) as OrderResponse;
          if (!body?.order?.orderId) return;
          sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(body));
          setOrder(body);
          return;
        }
        const current = readOrder();
        if (!current?.paymentClaim) return;
        const sync = await fetch(`/api/orders/${orderId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, paymentClaim: current.paymentClaim }),
        });
        if (!sync.ok) return;
        const body = (await sync.json()) as OrderResponse;
        if (!body?.order?.orderId) return;
        sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(body));
        setOrder(body);
      } catch {
        // The next poll can recover from a dropped connection.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [accessToken, orderId, status]);

  async function payWithGooglePay() {
    const checkout = order?.checkout;
    if (!checkout || !order) return;
    setPaying(true);
    setPayNote("");
    try {
      await loadRazorpay();
      const Razorpay = window.Razorpay;
      if (!Razorpay) {
        setPayNote("The payment app could not open. Please try again.");
        return;
      }
      const checkoutClient = new Razorpay({
        key: checkout.keyId,
        amount: checkout.amountPaise,
        currency: "INR",
        name: order.order.payment?.payeeName || "Pardeep Yadav",
        description: `Breakfast ${order.order.orderId}`,
        order_id: checkout.orderId,
        prefill: { name: order.order.customerName, contact: order.order.mobile },
        method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false },
        theme: { color: "#244A2A" },
        handler: async (response: RazorpaySuccess) => {
          await finishPayment(response);
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            setPayNote("Payment was not completed. This order stays pending.");
          },
        },
      });
      checkoutClient.on("payment.failed", () => {
        setPaying(false);
        setPayNote("The payment did not go through. This order is not confirmed.");
      });
      checkoutClient.open();
    } catch {
      setPayNote("The payment app could not open. Please try again.");
      setPaying(false);
    }
  }

  async function finishPayment(response: RazorpaySuccess) {
    if (!order) return;
    try {
      const saved = await fetch(`/api/orders/${order.order.orderId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: order.accessToken,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
          paymentClaim: order.paymentClaim,
        }),
      });
      const body = (await saved.json()) as OrderResponse & { error?: string };
      if (!saved.ok || !body.order?.orderId) {
        setPayNote(body.error || "The payment is not complete. This order is not confirmed.");
        return;
      }
      sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(body));
      setOrder(body);
      setPayNote("");
    } catch {
      setPayNote("The payment could not be checked. This order is not confirmed yet.");
    } finally {
      setPaying(false);
    }
  }

  async function copyUpi(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (order === undefined) {
    return (
      <>
        <SiteHeader />
        <main className="px-5 py-10 text-sm text-ink md:px-8">Loading your order…</main>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <SiteHeader />
        <main className="px-5 py-10 md:px-8">
          <h1 className="font-display text-3xl text-forest">No order to show</h1>
          <p className="mt-2 text-sm text-ink/80">Start from the menu and place a breakfast order.</p>
          <Button asChild className="mt-6">
            <Link href="/">Back to the menu</Link>
          </Button>
        </main>
      </>
    );
  }

  const details = order.order;
  const confirmed = details.status === "confirmed";
  const payment = details.payment;
  const apps = payment?.apps?.length
    ? payment.apps
    : payment
      ? [{ id: "gpay" as const, name: "Google Pay", androidUrl: payment.gpayUrl, iosUrl: payment.upiUrl }]
      : [];

  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-6 pb-12 md:px-8 md:pt-10">
        <div className="md:grid md:grid-cols-2 md:items-start md:gap-8">
        <div>
        <span
          className={
            confirmed
              ? "inline-flex rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-cream"
              : "inline-flex rounded-full bg-gold px-3 py-1 text-xs font-semibold text-forest-deep"
          }
        >
          {statusLabel(details.status)}
        </span>
        <h1 className="mt-4 font-display text-3xl font-medium text-forest md:text-4xl">
          {confirmed ? "Order confirmed" : "Choose how to pay"}
        </h1>
        <p className="mt-1 text-sm text-ink/80">
          {confirmed
            ? "The payment is verified. Show this number at the cart."
            : "Pay with Google Pay, PhonePe, or Paytm. The order stays pending, and it is not sent, until the payment succeeds."}
        </p>
        <p className="mt-4 font-display text-4xl text-forest">#{details.orderId}</p>

        <section className="mt-5 rounded-[1.75rem] bg-paper p-4 ring-1 ring-forest/10">
          <h2 className="font-display text-2xl text-forest">{details.productName}</h2>
          <p className="mt-1 text-sm text-ink/70">Quantity {details.quantity}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink">{details.ingredients.join(", ")}</p>
          {details.instructions ? (
            <p className="mt-3 text-sm text-ink">
              <span className="font-semibold text-forest">Note: </span>
              {details.instructions}
            </p>
          ) : null}
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">Total</dt>
              <dd className="font-semibold">{formatInr(details.total)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">Name</dt>
              <dd>{details.customerName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">Mobile</dt>
              <dd>{details.mobile}</dd>
            </div>
          </dl>
        </section>

        {confirmed ? <WhatsAppCard order={order} /> : (
          <p className="mt-4 text-sm leading-relaxed text-ink/80">
            This order is not sent on WhatsApp until the payment is verified.
          </p>
        )}
        </div>

        {confirmed ? (
          <section className="mt-4 rounded-[1.75rem] bg-leaf/10 p-4 ring-1 ring-leaf/20 md:mt-0">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-leaf text-cream">
                <Check className="size-5" strokeWidth={2.5} />
              </span>
              <p className="text-sm leading-relaxed text-forest">Your payment is verified and the cart has confirmed this order.</p>
            </div>
          </section>
        ) : (
          <section className="mt-4 rounded-[1.75rem] bg-paper p-4 ring-1 ring-forest/10 md:mt-0">
            <h2 className="font-display text-2xl text-forest">Payment</h2>
            <ol className="mt-3 grid gap-2 text-sm leading-relaxed text-ink">
              <li>1. Pay {formatInr(details.total)} with Google Pay, PhonePe, or Paytm.</li>
              <li>2. On a computer, scan the QR. On a phone, open one of the apps.</li>
            </ol>
            {payNote ? <p className="mt-3 text-sm leading-relaxed text-forest-deep">{payNote}</p> : null}
            {order.checkout ? (
              <div className="mt-4 rounded-2xl bg-white px-4 py-4">
                <p className="text-center font-display text-3xl text-forest">{formatInr(details.total)}</p>
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {["Google Pay", "PhonePe", "Paytm"].map((name) => (
                    <Button key={name} type="button" variant="gold" className="w-full px-3 text-sm" onClick={payWithGooglePay} disabled={paying}>
                      {paying ? "Checking…" : name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : payment ? (
              <div className="mt-4 rounded-2xl bg-white px-4 py-4 text-center">
                <p className="font-display text-2xl text-forest">{payment.payeeName}</p>
                {payment.qrDataUrl ? (
                  // The QR is a generated data URL, which next/image does not serve.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={payment.qrDataUrl}
                    alt={`Scan to pay ${payment.payeeName} with Google Pay, PhonePe, or Paytm`}
                    className="mx-auto mt-3 size-52 rounded-2xl md:size-64"
                  />
                ) : null}
                <p className="mt-2 text-sm text-ink/70">Scan with Google Pay, PhonePe, or Paytm</p>
                <p className="mt-3 font-display text-xl break-all text-forest">{payment.upiId}</p>
                <p className="mt-1 font-display text-3xl text-forest">{formatInr(details.total)}</p>
                <div className="mt-4 grid gap-2 text-left md:grid-cols-3">
                  {apps.map((app) => (
                    <Button key={app.id} asChild variant="gold" className="w-full px-3 text-sm">
                      <a href={appHref(app, payment.upiUrl, platform)}>{app.name}</a>
                    </Button>
                  ))}
                </div>
                <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => copyUpi(payment.upiId)}>
                  <Copy className="size-4" />
                  {copied ? "UPI ID copied" : "Copy UPI ID"}
                </Button>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-gold/30 px-4 py-3 text-sm leading-relaxed text-forest-deep">
                Payment is not ready on this site yet, so this order cannot be confirmed.
              </p>
            )}
          </section>
        )}
        </div>
      </main>
    </>
  );
}

function loadRazorpay() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay]");
    const script = existing ?? document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay failed to load"));
    if (!existing) document.body.appendChild(script);
    else if (window.Razorpay) resolve();
  });
}

function WhatsAppCard({ order }: { order: OrderResponse }) {
  const sent = order.whatsapp.sent;
  const manualUrl = order.whatsapp.manualUrl;
  return (
    <section className="mt-4 rounded-[1.75rem] bg-white/70 p-4 ring-1 ring-forest/10">
      {sent ? (
        <p className="text-sm leading-relaxed text-forest">
          The cart has this order on WhatsApp{order.whatsapp.orderPhone ? ` at ${order.whatsapp.orderPhone}` : ""}.
        </p>
      ) : manualUrl ? (
        <p className="text-sm leading-relaxed text-forest">
          Tap below to send the order to {order.whatsapp.orderPhone || "the cart"} on WhatsApp.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-forest">
          Your order is saved, but WhatsApp is not set up yet. Tell the cart your order number.
        </p>
      )}
      {manualUrl ? (
        <Button asChild className="mt-3 w-full" variant={sent ? "outline" : "default"} size="lg">
          <a href={manualUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-5" />
            {sent ? "Send a copy on WhatsApp" : "Send order on WhatsApp"}
          </a>
        </Button>
      ) : null}
    </section>
  );
}
