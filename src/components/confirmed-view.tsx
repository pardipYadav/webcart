"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/money";
import { ORDER_STORAGE_KEY, type OrderResponse } from "@/lib/types";

function readOrder(): OrderResponse | null {
  const raw = sessionStorage.getItem(ORDER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OrderResponse;
    if (!parsed?.order?.orderId || !parsed.order.productName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function ConfirmedView() {
  const [order, setOrder] = useState<OrderResponse | null | undefined>(undefined);

  useEffect(() => {
    setOrder(readOrder());
  }, []);

  if (order === undefined) {
    return (
      <>
        <SiteHeader />
        <main className="px-5 py-10 text-sm text-ink">Loading your order…</main>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <SiteHeader />
        <main className="px-5 py-10">
          <h1 className="font-display text-3xl text-forest">No order to show</h1>
          <p className="mt-2 text-sm text-ink/80">Start from the menu and send a new breakfast order.</p>
          <Button asChild className="mt-6">
            <Link href="/">Back to the menu</Link>
          </Button>
        </main>
      </>
    );
  }

  const details = order.order;
  const sent = order.whatsapp.sent;
  const manualUrl = order.whatsapp.manualUrl;

  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-6 pb-10">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-leaf text-cream">
          <Check className="size-8" strokeWidth={2.5} />
        </div>
        <h1 className="mt-4 font-display text-3xl font-medium text-forest">Order received</h1>
        <p className="mt-1 text-sm text-ink/80">Show this number if the cart asks for it.</p>
        <p className="mt-4 font-display text-4xl text-forest">#{details.orderId}</p>

        <section className="mt-5 rounded-[1.75rem] bg-paper p-4 ring-1 ring-forest/10">
          <h2 className="font-display text-2xl text-forest">{details.productName}</h2>
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
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">When</dt>
              <dd className="text-right">
                {details.dateLabel}
                <br />
                {details.timeLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/70">Pickup</dt>
              <dd>{details.pickupLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 rounded-[1.75rem] bg-white/70 p-4 ring-1 ring-forest/10">
          {sent ? (
            <p className="text-sm leading-relaxed text-forest">The cart has this order on WhatsApp.</p>
          ) : manualUrl ? (
            <p className="text-sm leading-relaxed text-forest">
              Your order is saved. Tap below to send it to the cart on WhatsApp.
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

        <Button asChild variant="outline" className="mt-4 w-full">
          <Link href="/">Place another order</Link>
        </Button>
      </main>
    </>
  );
}
