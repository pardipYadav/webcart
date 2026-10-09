import { NextResponse } from "next/server";
import { getMenu } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await getMenu();
  return NextResponse.json({ products });
}
