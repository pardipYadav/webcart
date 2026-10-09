"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInr } from "@/lib/money";
import { cleanName, normalizeMobile } from "@/lib/phone";
import { defaultSelection, includedIngredients, isAllToppings, optionalIngredients, selectionState, withRequiredIngredients } from "@/lib/pricing";
import { ORDER_STORAGE_KEY, type CartStatus, type Product } from "@/lib/types";

export function OrderForm({ product, status }: { product: Product; status: CartStatus }) {
  const router = useRouter();
  const idempotencyKey = useRef("");
  const startedAt = useRef(0);
  if (!idempotencyKey.current && typeof crypto !== "undefined") {
    idempotencyKey.current = crypto.randomUUID();
  }
  if (startedAt.current === 0) startedAt.current = Date.now();

  const [selected, setSelected] = useState<string[]>(() => defaultSelection(product));
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [instructions, setInstructions] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const optional = optionalIngredients(product);
  const included = includedIngredients(product);
  const priced = useMemo(() => selectionState(product, selected), [product, selected]);
  const allToppings = isAllToppings(product, selected);
  const someToppings = optional.some((ingredient) => selected.includes(ingredient.id));

  function toggle(id: string, on: boolean) {
    if (!on && product.ingredients.some((ingredient) => ingredient.id === id && ingredient.locked)) return;
    setSelected((current) => (on ? [...new Set([...current, id])] : current.filter((item) => item !== id)));
  }

  function toggleAll(on: boolean) {
    setSelected((current) => {
      const kept = current.filter((id) => !optional.some((ingredient) => ingredient.id === id));
      return on ? [...kept, ...optional.map((ingredient) => ingredient.id)] : kept;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !status.open) return;

    if (!cleanName(name)) {
      setError("Please enter your name.");
      return;
    }
    if (!normalizeMobile(mobile)) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    if (priced.chosen.length === 0) {
      setError("Choose at least one ingredient.");
      return;
    }

    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          customerName: name,
          mobile,
          productId: product.id,
          ingredientIds: withRequiredIngredients(product, selected),
          instructions,
          website,
          startedAt: startedAt.current,
        }),
      });
      const body = (await response.json()) as { error?: string; order?: { orderId: string } };
      if (!response.ok || !body.order) {
        setError(body.error || "We could not place the order. Please try again.");
        setPending(false);
        return;
      }
      sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(body));
      router.replace("/confirmed");
    } catch {
      setError("The connection dropped. Please try again. If you already saw an order number, don't send it twice.");
      setPending(false);
    }
  }

  return (
    <>
      <SiteHeader backHref="/" open={status.open} />
      <main className="flex-1 pb-36">
        <div className="relative mx-4 mt-4 aspect-[5/4] overflow-hidden rounded-[1.75rem] bg-cream-deep">
          <Image
            src={product.image}
            alt={product.imageAlt}
            fill
            priority
            sizes="(max-width: 512px) 100vw, 480px"
            className="object-cover"
          />
        </div>
        <div className="px-5 pt-4">
          <h1 className="font-display text-3xl font-medium text-forest">{product.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/80">{product.description}</p>
          <p className="mt-2 text-sm text-leaf">Usually ready in about {status.prepMinutes} minutes.</p>
        </div>

        {!status.open ? (
          <p className="mx-4 mt-4 rounded-2xl bg-gold/30 px-4 py-3 text-sm leading-relaxed text-forest-deep" role="status">
            {status.closedMessage}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="relative mt-4 px-4">
          <section className="rounded-[1.75rem] bg-paper p-3 ring-1 ring-forest/10">
            <h2 className="px-2 pt-1 text-xs font-semibold tracking-[0.16em] text-leaf uppercase">{product.baseLabel}</h2>
            <ul className="mt-1">
              {included.map((ingredient) => (
                <IngredientRow
                  key={ingredient.id}
                  id={`${product.id}-${ingredient.id}`}
                  name={ingredient.name}
                  checked={ingredient.locked || selected.includes(ingredient.id)}
                  locked={ingredient.locked}
                  onCheckedChange={(on) => toggle(ingredient.id, on)}
                />
              ))}
            </ul>

            <h2 className="px-2 pt-3 text-xs font-semibold tracking-[0.16em] text-leaf uppercase">Toppings</h2>
            <ul>
              <IngredientRow
                id={`${product.id}-all-toppings`}
                name="All available toppings"
                checked={allToppings ? true : someToppings ? "indeterminate" : false}
                emphasized
                onCheckedChange={toggleAll}
              />
              {optional.map((ingredient) => (
                <IngredientRow
                  key={ingredient.id}
                  id={`${product.id}-${ingredient.id}`}
                  name={ingredient.name}
                  checked={selected.includes(ingredient.id)}
                  onCheckedChange={(on) => toggle(ingredient.id, on)}
                />
              ))}
            </ul>
            <p className="px-2 pt-1 pb-2 text-xs leading-relaxed text-ink/70">
              Toppings are included. The price stays {formatInr(product.basePrice)}.
            </p>
          </section>

          <section className="mt-4 rounded-[1.75rem] bg-paper p-4 ring-1 ring-forest/10">
            <h2 className="font-display text-xl text-forest">Your details</h2>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customer-name">Name</Label>
                <Input
                  id="customer-name"
                  name="customerName"
                  autoComplete="name"
                  autoCapitalize="words"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Rahul Sharma"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-mobile">Mobile number</Label>
                <div className="flex h-12 items-center rounded-2xl border border-line bg-white focus-within:ring-2 focus-within:ring-leaf">
                  <span className="pl-4 text-ink/70">+91</span>
                  <input
                    id="customer-mobile"
                    name="mobile"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={16}
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    placeholder="98765 43210"
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-forest outline-none placeholder:text-ink/40"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="instructions">Special instructions</Label>
                <Textarea
                  id="instructions"
                  value={instructions}
                  maxLength={300}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="No honey, extra banana, less milk"
                />
              </div>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute h-0 w-0 overflow-hidden">
              <label htmlFor="company-website">Website</label>
              <input
                id="company-website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
          </section>

          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg border-t border-line bg-cream/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="flex items-center gap-3">
              <p className="min-w-24 font-display text-2xl text-forest" aria-live="polite">
                {formatInr(priced.total)}
              </p>
              <Button type="submit" size="lg" className="flex-1" disabled={pending || !status.open}>
                {pending ? "Placing order…" : status.open ? "Continue to payment" : "Cart is closed"}
              </Button>
            </div>
            {error ? (
              <p className="mt-2 text-sm font-medium text-red-800" role="alert">
                {error}
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink/70">{priced.chosen.map((item) => item.name).join(", ") || "Choose an ingredient"}</p>
            )}
          </div>
        </form>
      </main>
    </>
  );
}

function IngredientRow({
  id,
  name,
  checked,
  emphasized = false,
  locked = false,
  onCheckedChange,
}: {
  id: string;
  name: string;
  checked: boolean | "indeterminate";
  emphasized?: boolean;
  locked?: boolean;
  onCheckedChange: (on: boolean) => void;
}) {
  return (
    <li className={emphasized ? "list-none" : undefined}>
      <div
        className={
          emphasized
            ? "mt-1 flex min-h-14 items-center gap-3 rounded-2xl bg-[#f8edd0] px-3"
            : "flex min-h-14 items-center gap-3 rounded-2xl px-3"
        }
      >
        <Checkbox
          id={id}
          checked={checked}
          disabled={locked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className={locked ? "cursor-default opacity-100" : undefined}
        />
        <label
          htmlFor={id}
          className={
            locked
              ? "flex min-w-0 flex-1 cursor-default items-center justify-between gap-3 py-2"
              : "flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 py-2"
          }
        >
          <span className="font-medium text-forest">{name}</span>
        </label>
      </div>
    </li>
  );
}
