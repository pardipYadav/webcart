"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/money";
import type { DeskOrder } from "@/lib/types";

export function VerifyPanel({ order, token }: { order: DeskOrder; token: string }) {
  const [status, setStatus] = useState(order.status);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function confirm() {
    if (pending || status === "confirmed") return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${order.orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifyToken: token }),
      });
      const body = (await response.json()) as {
        error?: string;
        status?: "pending_payment" | "confirmed";
        whatsapp?: { sent: boolean; manualUrl: string | null };
      };
      if (!response.ok || body.status !== "confirmed") {
        setError(body.error || "The order could not be confirmed.");
        setPending(false);
        return;
      }
      setStatus("confirmed");
      setSent(body.whatsapp?.sent === true);
      setManualUrl(body.whatsapp?.manualUrl ?? null);
      setPending(false);
    } catch {
      setError("The connection dropped. Please try again.");
      setPending(false);
    }
  }

  const confirmed = status === "confirmed";

  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-6 pb-12">
        <span
          className={
            confirmed
              ? "inline-flex rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-cream"
              : "inline-flex rounded-full bg-gold px-3 py-1 text-xs font-semibold text-forest-deep"
          }
        >
          {confirmed ? "Confirmed" : "Pending Payment"}
        </span>
        <h1 className="mt-4 font-display text-3xl text-forest">#{order.orderId}</h1>
        <p className="mt-2 text-sm text-ink/80">Check this payment in Google Pay, then confirm the order.</p>
        <section className="mt-5 rounded-[1.75rem] bg-paper p-4 text-sm ring-1 ring-forest/10">
          <h2 className="font-display text-2xl text-forest">{order.productName}</h2>
          <p className="mt-2 text-ink">
            Quantity {order.quantity}. {order.ingredients.join(", ")}
          </p>
          <dl className="mt-4 grid gap-2">
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">Total</dt>
              <dd className="font-semibold">{formatInr(order.total)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">Customer</dt>
              <dd className="text-right">
                {order.customerName}
                <br />
                {order.mobile}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">Reference</dt>
              <dd className="text-right">{order.paymentReference || "Not shared yet"}</dd>
            </div>
          </dl>
        </section>
        {confirmed ? (
          <p className="mt-4 text-sm leading-relaxed text-forest">This order is confirmed.</p>
        ) : (
          <Button type="button" className="mt-4 w-full" size="lg" onClick={confirm} disabled={pending}>
            {pending ? "Confirming…" : "Mark payment as confirmed"}
          </Button>
        )}
        {error ? (
          <p className="mt-3 text-sm font-medium text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        {manualUrl && !sent ? (
          <Button asChild className="mt-3 w-full" variant="outline" size="lg">
            <a href={manualUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-5" />
              Send confirmation on WhatsApp
            </a>
          </Button>
        ) : null}
        {sent ? <p className="mt-3 text-sm text-forest">The confirmation is on WhatsApp.</p> : null}
      </main>
    </>
  );
}
