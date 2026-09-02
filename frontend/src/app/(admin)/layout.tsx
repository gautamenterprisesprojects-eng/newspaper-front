"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { apiFetch, clearSession, getRole, getUsername } from "@/lib/api";
import { PageMintLockup } from "@/components/PageMintLogo";

const NAV_ITEMS = [
  { name: "ओवरव्यू", href: "/saas-admin", icon: "O" },
  { name: "आवेदन", href: "/saas-admin/requests", icon: "A" },
  { name: "पब्लिशर", href: "/saas-admin/publishers", icon: "P" },
  { name: "दर", href: "/saas-admin/pricing", icon: "₹" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Tapping a nav item should dismiss the drawer -- otherwise it stays open
  // over the screen the user just navigated to.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (getRole() !== "ADMIN") {
      router.replace("/login");
      return;
    }
    setUsername(getUsername());
    apiFetch("/saas-admin/overview").then((r) => r.json()).then((d) => d?.metrics && setPendingCount(d.metrics.pending_requests ?? 0)).catch(() => {});
  }, [router]);

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  const isActive = (href: string) => (href === "/saas-admin" ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-[100dvh] w-full bg-gray-50 text-gray-900">
      {/* Scrim: only exists while the drawer is open on a phone. */}
      {drawerOpen && (
        <div
          className="animate-sheet-scrim-in fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex min-h-[100dvh]">
        {/* Off-canvas on phones, permanent column from lg. A 256px sidebar on
            a 390px screen leaves nothing for the actual content. */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 sidebar-shell flex w-64 flex-shrink-0 flex-col text-gray-100 transition-transform duration-300 lg:static lg:translate-x-0 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-5 pt-safe">
            <PageMintLockup size={32} tone="light" subtitle="एडमिन पैनल" />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="मेन्यू बंद करें"
              className="tap -mr-2 rounded-lg p-2 text-gray-400 lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 px-3 py-5 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} className={`nav-item flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium ${active ? "is-active" : "text-white/65"}`}>
                  <span className="flex items-center gap-2.5"><span className="text-xs w-5 text-center font-bold">{item.icon}</span>{item.name}</span>
                  {item.href === "/saas-admin/requests" && pendingCount !== null && pendingCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-emerald-500 text-white" : "bg-white/15 text-white/80"}`}>{pendingCount}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-1 border-t border-white/10 px-3 py-4">
            <Link href="/login" className="nav-item flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/55">पब्लिशर ऐप</Link>
            <button onClick={logout} className="nav-item flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/55">लॉग आउट</button>
          </div>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Sticky only on phones; desktop keeps the original static header. */}
          <header className="sticky top-0 z-30 flex-shrink-0 border-b border-gray-200 bg-white/95 backdrop-blur pt-safe lg:static lg:bg-white lg:backdrop-blur-none">
            <div className="flex h-14 items-center justify-between gap-3 px-4 lg:h-16 lg:px-8">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="मेन्यू खोलें"
                  className="tap -ml-2 rounded-lg p-2 text-gray-700 lg:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="truncate text-sm text-gray-500">न्यूज़पेपर मैनेजर</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-bold text-white">{(username || "A").slice(0, 1).toUpperCase()}</div>
                <span className="hidden text-sm font-medium text-gray-700 sm:inline">{username || "एडमिन"}</span>
              </div>
            </div>
          </header>
          <main className="w-full max-w-6xl flex-1 p-4 pb-safe animate-screen-in lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
