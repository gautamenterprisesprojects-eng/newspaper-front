import React from "react";
import { Hind, Inter } from "next/font/google";
import "./globals.css";
import SiteChrome from "@/components/SiteChrome";

// tailwind.config.ts already declared "Inter" as the brand sans font, but
// nothing ever actually loaded it -- with no webfont present, every browser
// silently fell back to system-ui (Segoe UI on Windows), which is why the
// whole portal read as a generic, unstyled admin panel. Inter alone isn't
// enough here either: it has no Devanagari glyphs, and this UI is almost
// entirely Hindi text, so Hind (built specifically for professional
// Devanagari UI/print, the same reason Indian news portals use it) covers
// what Inter can't -- the two stack together below.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const hind = Hind({
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind",
  display: "swap",
});

export const metadata = {
  title: "PageMint",
  description: "पब्लिशर, वॉलेट और न्यूज़पेपर जनरेटर को मैनेज करने वाला पोर्टल.",
  appleWebApp: { capable: true, statusBarStyle: "default" as const, title: "PageMint" },
};

// viewportFit "cover" lets the app paint under the notch/home indicator, which
// is what makes env(safe-area-inset-*) return real values -- without it the
// WebView letterboxes the page and the shell reads as a web page in a frame.
// Zoom is pinned because a pinch-zoomable UI is the single most obvious tell
// that a "native" app is actually a WebView.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
  themeColor: "#047857",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi" className={`${inter.variable} ${hind.variable}`}>
      <body className="min-h-[100dvh] bg-gray-50 text-gray-900 font-sans antialiased app-shell">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
