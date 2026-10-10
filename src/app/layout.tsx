import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Outfit } from "next/font/google";
import { RegisterSW } from "@/components/register-sw";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

function metadataBase() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return new URL("http://localhost:3000");
  try {
    return new URL(value);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: "Traverso — Healthy Fuel",
    template: "%s · Traverso",
  },
  description: "Pre-order an oats bowl or peanut butter sandwich from the Traverso breakfast cart.",
  applicationName: "Traverso",
  appleWebApp: {
    capable: true,
    title: "Traverso",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Traverso — Healthy Fuel",
    description: "Pre-order breakfast from the Traverso cart.",
    images: ["/menu/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F1E4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body>
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-cream shadow-[0_0_80px_rgba(0,0,0,0.28)] md:max-w-5xl">
          {children}
        </div>
        <RegisterSW />
        <noscript>
          <p className="mx-auto max-w-lg bg-gold px-4 py-3 text-center text-sm text-forest-deep">
            Turn on JavaScript to place a breakfast order.
          </p>
        </noscript>
      </body>
    </html>
  );
}
