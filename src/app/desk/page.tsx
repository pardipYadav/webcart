import type { Metadata } from "next";
import { DeskView } from "@/components/desk-view";

export const metadata: Metadata = {
  title: "Cart desk",
  robots: { index: false, follow: false },
};

export default function DeskPage() {
  return <DeskView />;
}
