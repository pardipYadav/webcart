"use client";

export function QrActions({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="no-print mt-5 grid gap-3">
      <a
        href={imageUrl}
        download="traverso-qr.png"
        className="inline-flex h-12 items-center justify-center rounded-full bg-forest font-semibold text-cream"
      >
        Download PNG
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-12 items-center justify-center rounded-full border border-forest/15 bg-paper font-semibold text-forest"
      >
        Print
      </button>
    </div>
  );
}
