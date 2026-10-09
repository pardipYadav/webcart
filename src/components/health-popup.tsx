"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const STORAGE_KEY = "traverso-health-seen";

export function HealthPopup({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      onDismiss();
      return;
    }
    setOpen(true);
  }, [onDismiss]);

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
    onDismiss();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("start-order")?.focus();
        }}
      >
        <Image src="/icons/icon-192.png" alt="" width={52} height={52} className="rounded-2xl" />
        <p className="mt-4 text-xs font-semibold tracking-[0.18em] text-leaf uppercase">Today&apos;s note</p>
        <DialogTitle className="mt-2 font-display text-[1.65rem] leading-snug font-medium text-forest">
          {message}
        </DialogTitle>
        <Button id="start-order" className="mt-6 w-full" size="lg" onClick={dismiss}>
          Start my order
        </Button>
      </DialogContent>
    </Dialog>
  );
}
