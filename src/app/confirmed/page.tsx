import type { Metadata } from "next";
import { ConfirmedView } from "@/components/confirmed-view";

export const metadata: Metadata = { title: "Order received" };

export default function ConfirmedPage() {
  return <ConfirmedView />;
}
