import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return ip.slice(0, 80);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const result = await placeOrder(payload, clientIp(request));
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("[orders] unexpected");
    return NextResponse.json(
      { error: "We could not place the order. Please try again." },
      { status: 500 },
    );
  }
}
