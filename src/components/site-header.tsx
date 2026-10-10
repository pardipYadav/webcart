import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function SiteHeader({ backHref, open }: { backHref?: string; open?: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/80 bg-cream/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back to the menu"
            className="grid size-10 shrink-0 place-items-center rounded-full text-forest hover:bg-white focus-visible:ring-2 focus-visible:ring-leaf focus-visible:outline-none"
          >
            <ChevronLeft className="size-6" />
          </Link>
        ) : (
          <Image src="/icons/icon-192.png" alt="" width={42} height={42} className="size-[42px] shrink-0 rounded-[12px]" />
        )}
        <div className="min-w-0">
          <p className="font-display text-xl leading-none text-forest">Traverso</p>
          <p className="mt-1 text-xs font-medium tracking-wide text-leaf">Healthy Fuel</p>
        </div>
      </div>
      {open === undefined ? null : (
        <span
          className={
            open
              ? "rounded-full bg-leaf px-3 py-1 text-xs font-semibold text-cream"
              : "rounded-full bg-cream-deep px-3 py-1 text-xs font-semibold text-ink"
          }
        >
          {open ? "Open" : "Closed"}
        </span>
      )}
    </header>
  );
}
