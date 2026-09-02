"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageMintBadge } from "@/components/PageMintLogo";

const ADMIN_PREFIXES = ["/saas-admin", "/system-health"];
const PUBLISHER_PREFIXES = ["/dashboard", "/wallet", "/history", "/profile", "/settings"];


export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublisherRoute = PUBLISHER_PREFIXES.some((p) => pathname.startsWith(p));

  if (isAdminRoute || isPublisherRoute) return <>{children}</>;

  // No top bar on the public routes at all. It went out with the landing
  // page: once the marketing nav and the login CTA were removed, the bar
  // held nothing but the wordmark, above a login card that carries its own
  // logo. The footer wordmark still links home for anyone who wants it.

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <PageMintBadge size={28} />
            <span className="font-extrabold text-sm tracking-tight text-gray-950">PageMint</span>
          </Link>
          <span className="text-xs text-gray-500">© {new Date().getFullYear()} PageMint · पब्लिशर, वॉलेट और जनरेटर मैनेजमेंट पोर्टल</span>
        </div>
      </footer>
    </div>
  );
}
