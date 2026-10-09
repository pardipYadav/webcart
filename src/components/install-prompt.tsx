"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "traverso-install-dismissed";
const DISMISS_FOR_MS = 21 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function dismissedRecently() {
  const stored = localStorage.getItem(DISMISS_KEY);
  if (!stored) return false;
  return Date.now() - Number(stored) < DISMISS_FOR_MS;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function InstallPrompt({ visible }: { visible: boolean }) {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setShow(true);

    function onPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible || !show) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") dismiss();
    setPromptEvent(null);
  }

  return (
    <section className="rounded-[1.5rem] bg-white/80 p-4 ring-1 ring-forest/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf/10 text-leaf">
            <Share className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-lg leading-tight text-forest">Keep Traverso on your phone</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/80">
              Add this page to your home screen. Next time you can order without scanning the QR code.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink hover:bg-cream"
          aria-label="Dismiss home screen instructions"
        >
          <X className="size-4" />
        </button>
      </div>
      {promptEvent ? (
        <button
          type="button"
          onClick={install}
          className="mt-3 h-11 w-full rounded-full bg-forest text-sm font-semibold text-cream"
        >
          Add to Home Screen
        </button>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {ios
            ? "Tap the Share button in your browser, then choose Add to Home Screen."
            : "Open the browser menu and choose Add to Home screen or Install app."}
        </p>
      )}
    </section>
  );
}
