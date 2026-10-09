import { NextResponse } from "next/server";
import { confirmOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local").slice(0, 80);
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const payload = (await request.json().catch(() => null)) as { verifyToken?: string } | null;
  const result = await confirmOrder(
    orderId,
    { verifyToken: payload?.verifyToken, ownerKey: request.headers.get("x-owner-key") ?? "" },
    clientIp(request),
  );
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
