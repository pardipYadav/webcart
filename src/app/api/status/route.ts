import { NextResponse } from "next/server";
import { getCartStatus } from "@/lib/cart-status";
import { getDailyHealthMessage } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const [status, health] = await Promise.all([getCartStatus(), getDailyHealthMessage()]);
  return NextResponse.json({ status, health });
}
