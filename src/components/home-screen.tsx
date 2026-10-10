"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Heart, Leaf, Sparkles } from "lucide-react";
import { HealthPopup } from "@/components/health-popup";
import { InstallPrompt } from "@/components/install-prompt";
import { SiteHeader } from "@/components/site-header";
import { formatInr } from "@/lib/money";
import type { CartStatus, HealthNote, Product } from "@/lib/types";

const highlights = [
  { icon: Leaf, label: "Fresh ingredients" },
  { icon: Sparkles, label: "Rich in nutrition" },
  { icon: Heart, label: "Keeps you energised" },
];

export function HomeScreen({
  menu,
  status,
  health,
}: {
  menu: Product[];
  status: CartStatus;
  health: HealthNote;
}) {
  const [noteDismissed, setNoteDismissed] = useState(false);
  const dismissNote = useCallback(() => setNoteDismissed(true), []);

  return (
    <>
      <HealthPopup message={health.text} onDismiss={dismissNote} />
      <SiteHeader open={status.open} />
      <main className="flex-1 px-4 pt-5 pb-8 md:px-8 md:pt-8">
        <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-leaf uppercase">Good food, better you</p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.15] font-medium text-forest md:text-5xl">
          Breakfast, ready when you arrive.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">
          Choose an oats bowl or a peanut butter sandwich, then add what you like.
        </p>

        {status.hoursLabel ? (
          status.open ? (
            <p className="mt-4 text-sm font-medium text-leaf">{status.hoursLabel}</p>
          ) : (
            <p className="mt-4 rounded-2xl bg-gold/30 px-4 py-3 text-sm leading-relaxed text-forest-deep" role="status">
              {status.closedMessage}
            </p>
          )
        ) : null}

        <div className="mt-4">
          <InstallPrompt visible={noteDismissed} />
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {menu.map((product) => (
            <Link
              key={product.id}
              href={`/order/${product.id}`}
              className="block overflow-hidden rounded-[1.75rem] bg-paper shadow-[0_12px_40px_rgba(36,74,42,0.08)] ring-1 ring-forest/10 focus-visible:ring-2 focus-visible:ring-leaf focus-visible:outline-none"
            >
              <div className="relative aspect-[5/4] bg-cream-deep">
                <Image
                  src={product.image}
                  alt={product.imageAlt}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 480px"
                  className="object-cover"
                />
                <span
                  className={
                    product.accent === "gold"
                      ? "absolute top-4 left-4 rounded-full bg-gold px-3 py-1 text-sm font-semibold text-forest-deep"
                      : "absolute top-4 left-4 rounded-full bg-leaf px-3 py-1 text-sm font-semibold text-cream"
                  }
                >
                  {product.name}
                </span>
              </div>
              <div className="flex items-end justify-between gap-3 px-4 py-4">
                <div>
                  <p className="text-sm text-ink/80">{product.tagline}</p>
                  <p className="mt-1 font-display text-2xl text-forest">{formatInr(product.basePrice)}</p>
                </div>
                <span className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-cream">
                  {status.open ? "Customize" : "View"}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <ul className="mt-8 grid grid-cols-3 gap-2 text-center">
          {highlights.map((item) => (
            <li key={item.label} className="rounded-2xl px-1 py-2">
              <item.icon className="mx-auto size-5 text-leaf" aria-hidden="true" />
              <p className="mt-2 text-xs leading-snug font-medium text-ink">{item.label}</p>
            </li>
          ))}
        </ul>

        <footer className="mt-6 text-center text-xs leading-relaxed text-ink/70">
          {status.hoursLabel ? <p>{status.hoursLabel}</p> : null}
          <p className={status.hoursLabel ? "mt-2" : undefined}>
            <Link href="/qr" className="font-semibold text-leaf underline-offset-2 hover:underline">
              QR code for the cart
            </Link>
          </p>
        </footer>
      </main>
      <svg viewBox="0 0 400 72" className="block w-full text-leaf" aria-hidden="true" preserveAspectRatio="none">
        <path fill="currentColor" opacity="0.28" d="M0 34c48 22 88 18 136-2 42-18 78-16 122 2 40 16 86 14 142-8v46H0Z" />
        <path fill="#244A2A" d="M0 48c52 16 96 6 146-6 46-12 78-6 122 6 36 10 84 8 132-8v32H0Z" />
      </svg>
    </>
  );
}
