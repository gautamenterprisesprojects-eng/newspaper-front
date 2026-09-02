"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageMintBadge } from "@/components/PageMintLogo";

const ADMIN_PREFIXES = ["/saas-admin", "/system-health"];
const PUBLISHER_PREFIXES = ["/dashboard", "/wallet", "/history", "/profile", "/settings"];

// Nav link with a growing underline on hover (drawn as a real element, not a
// pseudo-element) so it can pick up the brand's own emerald->teal gradient
// instead of a flat single-colour rule.
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group relative py-1 text-gray-600 hover:text-gray-950">
      {children}
      <span className="absolute -bottom-0.5 left-0 h-[2px] w-0 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 transition-all duration-300 group-hover:w-full" />
    </Link>
  );
}

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublisherRoute = PUBLISHER_PREFIXES.some((p) => pathname.startsWith(p));

  if (isAdminRoute || isPublisherRoute) return <>{children}</>;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-50 h-[72px] bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <PageMintBadge size={40} />
            <span className="font-extrabold text-lg tracking-tight text-gray-950">PageMint</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold">
            <NavLink href="/#features">सुविधाएं</NavLink>
            <NavLink href="/#workflow">कैसे काम करता है</NavLink>
          </nav>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg hover:shadow-emerald-500/35 hover:-translate-y-0.5"
          >
            पब्लिशर लॉगिन
          </Link>
        </div>
      </header>
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
