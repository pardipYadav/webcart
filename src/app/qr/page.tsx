import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { QrActions } from "@/components/qr-actions";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cart QR code" };

async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function QrPage() {
  const url = await siteUrl();
  const configured = Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim());
  const imageUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 640,
    color: { dark: "#244A2A", light: "#FFFBF3" },
  });

  return (
    <>
      <SiteHeader backHref="/" />
      <main className="px-5 py-6">
        <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-leaf uppercase">For the cart</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-forest">Scan to pre-order</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">
          Print this and keep it where customers can see it. Scanning opens the menu in their phone browser.
        </p>
        <div className="mt-5 rounded-[1.75rem] bg-paper p-5 ring-1 ring-forest/10">
          {/* The QR is a generated data URL, which next/image does not serve. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="QR code that opens the Traverso order page" className="mx-auto w-full max-w-xs" />
          <p className="mt-4 text-center text-sm break-all text-ink">{url}</p>
        </div>
        {!configured ? (
          <p className="mt-4 text-sm leading-relaxed text-ink">
            This code uses the address you are on now. Set NEXT_PUBLIC_SITE_URL to the live site before you print it.
          </p>
        ) : null}
        <QrActions imageUrl={imageUrl} />
      </main>
    </>
  );
}
