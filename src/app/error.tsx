"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="px-5 py-10">
      <h1 className="font-display text-3xl text-forest">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink/80">Please try that again.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
