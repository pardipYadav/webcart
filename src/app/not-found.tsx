import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="px-5 py-10">
        <h1 className="font-display text-3xl text-forest">That page is not on the menu</h1>
        <p className="mt-2 text-sm text-ink/80">Head back and choose a breakfast.</p>
        <Button asChild className="mt-6">
          <Link href="/">Back to the menu</Link>
        </Button>
      </main>
    </>
  );
}
