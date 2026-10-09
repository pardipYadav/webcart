"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatInr } from "@/lib/money";
import type { DeskOrder } from "@/lib/types";

const KEY_STORAGE = "traverso-owner-key";

export function DeskView() {
  const [key, setKey] = useState("");
  const [ready, setReady] = useState(false);
  const [orders, setOrders] = useState<DeskOrder[] | null>(null);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(KEY_STORAGE) ?? "";
    setKey(saved);
    setReady(true);
    if (saved) void load(saved);
  }, []);

  async function load(ownerKey: string) {
    setError("");
    const response = await fetch("/api/desk/orders", { headers: { "x-owner-key": ownerKey } });
    const body = (await response.json()) as { orders?: DeskOrder[]; error?: string };
    if (!response.ok || !body.orders) {
      setOrders(null);
      setError(body.error || "The order list could not be opened.");
      return;
    }
    sessionStorage.setItem(KEY_STORAGE, ownerKey);
    setOrders(body.orders);
  }

  async function confirm(orderId: string) {
    setPendingId(orderId);
    setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-owner-key": key },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as { error?: string; status?: string };
      if (!response.ok || body.status !== "confirmed") {
        setError(body.error || "That order could not be confirmed.");
        setPendingId("");
        return;
      }
      setOrders((current) => current?.map((order) => (order.orderId === orderId ? { ...order, status: "confirmed" } : order)) ?? null);
      setPendingId("");
    } catch {
      setError("The connection dropped. Please try again.");
      setPendingId("");
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-6 pb-12">
        <h1 className="font-display text-3xl text-forest">Cart desk</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">
          Verify the Google Pay payment, then mark the order confirmed.
        </p>
        {ready && orders === null ? (
          <form
            className="mt-5 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void load(key.trim());
            }}
          >
            <Label htmlFor="owner-key">Owner key</Label>
            <Input id="owner-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} />
            <Button type="submit">Open orders</Button>
          </form>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm font-medium text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 grid gap-3">
          {orders?.map((order) => (
            <article key={order.orderId} className="rounded-[1.75rem] bg-paper p-4 ring-1 ring-forest/10">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl text-forest">#{order.orderId}</h2>
                <span
                  className={
                    order.status === "confirmed"
                      ? "rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-cream"
                      : "rounded-full bg-gold px-3 py-1 text-xs font-semibold text-forest-deep"
                  }
                >
                  {order.status === "confirmed" ? "Confirmed" : "Pending Payment"}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink">
                {order.productName} × {order.quantity}
              </p>
              <p className="mt-1 text-sm text-ink/80">{order.ingredients.join(", ")}</p>
              <p className="mt-2 text-sm text-forest">
                {order.customerName} · {order.mobile}
              </p>
              <p className="mt-1 text-sm font-semibold text-forest">{formatInr(order.total)}</p>
              <p className="mt-1 text-sm text-ink/80">Reference: {order.paymentReference || "Not shared yet"}</p>
              {order.status === "pending_payment" ? (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={() => confirm(order.orderId)}
                  disabled={pendingId === order.orderId}
                >
                  {pendingId === order.orderId ? "Confirming…" : "Mark as confirmed"}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
