import { NextResponse } from "next/server";
import { listDeskOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = await listDeskOrders(request.headers.get("x-owner-key") ?? "");
  if (!result.ok) {
    const error = result.status === 503 ? "Orders are not available right now." : "That owner key does not match.";
    return NextResponse.json({ error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ orders: result.orders }, { headers: { "Cache-Control": "no-store" } });
}
