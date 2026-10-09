import { NextResponse } from "next/server";
import { submitPayment } from "@/lib/orders";
import { requestOrigin } from "@/lib/payment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local").slice(0, 80);
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const payload = await request.json().catch(() => null);
  const result = await submitPayment(orderId, payload, clientIp(request), requestOrigin(request));
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
