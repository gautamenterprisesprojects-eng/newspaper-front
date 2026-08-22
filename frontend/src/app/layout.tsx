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
  title: "न्यूज़पेपर मैनेजर",
  description: "पब्लिशर, वॉलेट और न्यूज़पेपर जनरेटर को मैनेज करने वाला पोर्टल.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi" className={`${inter.variable} ${hind.variable}`}>
      <body className="min-h-screen bg-gray-50 text-gray-900 font-sans antialiased">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
