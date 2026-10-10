import { NextResponse } from "next/server";
import { handleRazorpayWebhook } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const status = await handleRazorpayWebhook(rawBody, signature);
  return new NextResponse(null, { status });
}
