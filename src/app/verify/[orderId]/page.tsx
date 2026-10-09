import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { VerifyPanel } from "@/components/verify-panel";
import { previewForVerify } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm payment",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orderId } = await params;
  const { token } = await searchParams;
  const order = await previewForVerify(orderId, token ?? "");

  if (!order || !token) {
    return (
      <>
        <SiteHeader />
        <main className="px-5 py-10">
          <h1 className="font-display text-3xl text-forest">Link not valid</h1>
          <p className="mt-2 text-sm text-ink/80">Open the confirmation link from the order message on WhatsApp.</p>
        </main>
      </>
    );
  }

  return <VerifyPanel order={order} token={token} />;
}
