"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_PREFIXES = ["/saas-admin", "/system-health"];
const PUBLISHER_PREFIXES = ["/dashboard", "/wallet", "/history", "/profile"];

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublisherRoute = PUBLISHER_PREFIXES.some((p) => pathname.startsWith(p));

  if (isAdminRoute || isPublisherRoute) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-50 h-16 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-lg bg-black text-white flex items-center justify-center font-bold">N</span>
            <span className="font-bold tracking-tight">न्यूज़पेपर मैनेजर</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <Link href="/#workflow" className="hover:text-black">काम कैसे होगा</Link>
            <Link href="/#pricing" className="hover:text-black">दर</Link>
            <Link href="/login" className="hover:text-black">लॉगिन</Link>
          </nav>
          <Link href="/login" className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800">
            पब्लिशर लॉगिन
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-xs text-gray-500 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} न्यूज़पेपर मैनेजर</span>
          <span>पब्लिशर, वॉलेट और जनरेटर मैनेजमेंट</span>
        </div>
      </footer>
    </div>
  );
}
