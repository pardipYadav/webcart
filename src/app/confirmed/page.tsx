import type { Metadata } from "next";
import { ConfirmedView } from "@/components/confirmed-view";

export const metadata: Metadata = { title: "Pay for your order" };

export default function ConfirmedPage() {
  return <ConfirmedView />;
}
