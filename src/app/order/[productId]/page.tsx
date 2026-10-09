import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderForm } from "@/components/order-form";
import { getCartStatus } from "@/lib/cart-status";
import { getMenu } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;
  const menu = await getMenu();
  const product = menu.find((item) => item.id === productId);
  return { title: product?.name ?? "Order" };
}

export default async function OrderPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const [menu, status] = await Promise.all([getMenu(), getCartStatus()]);
  const product = menu.find((item) => item.id === productId);
  if (!product) notFound();
  return <OrderForm product={product} status={status} />;
}
