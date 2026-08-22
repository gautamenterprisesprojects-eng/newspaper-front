"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, clearSession, getRole, getUsername } from "@/lib/api";

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
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="flex min-h-screen">
        <aside className="w-64 flex-shrink-0 bg-black text-gray-100 flex flex-col">
          <div className="h-16 flex items-center px-6 border-b border-gray-800">
            <span className="text-lg font-bold tracking-tight">एडमिन पैनल</span>
          </div>
          <nav className="flex-1 px-3 py-5 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${active ? "bg-white text-black" : "text-gray-300 hover:bg-gray-900 hover:text-white"}`}>
                  <span className="flex items-center gap-2.5"><span className="text-xs w-5 text-center font-bold">{item.icon}</span>{item.name}</span>
                  {item.href === "/saas-admin/requests" && pendingCount !== null && pendingCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-black text-white" : "bg-gray-700 text-gray-100"}`}>{pendingCount}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="px-3 py-4 border-t border-gray-800 space-y-1">
            <Link href="/login" className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-900 hover:text-white transition">पब्लिशर ऐप</Link>
            <button onClick={logout} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-900 hover:text-white transition">लॉग आउट</button>
          </div>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-8">
            <div className="text-sm text-gray-500">न्यूज़पेपर मैनेजर</div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">{(username || "A").slice(0, 1).toUpperCase()}</div>
              <span className="text-sm font-medium text-gray-700">{username || "एडमिन"}</span>
            </div>
          </header>
          <main className="flex-1 p-8 max-w-6xl w-full">{children}</main>
        </div>
      </div>
    </div>
  );
}
