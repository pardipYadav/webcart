import { NextResponse } from "next/server";
import { getCustomerOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local").slice(0, 80);
}

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const access = new URL(request.url).searchParams.get("access") ?? "";
  const result = await getCustomerOrder(orderId, access, clientIp(request));
  return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
