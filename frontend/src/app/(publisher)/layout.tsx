"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, clearSession, getPublisherId, getUsername } from "@/lib/api";

const NAV = [
  { name: "डैशबोर्ड", href: "/dashboard" },
  { name: "वॉलेट", href: "/wallet" },
  { name: "पुराने अंक", href: "/history" },
  { name: "प्रोफाइल", href: "/profile" },
  { name: "सेटिंग्स", href: "/settings" },
];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "NP";
}

export default function PublisherWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [newspaperName, setNewspaperName] = useState("पब्लिशर");
  const [balance, setBalance] = useState<number | null>(null);
  // Read only after mount, same as newspaperName/balance below -- getUsername()
  // reads localStorage, which doesn't exist during server-side render. Calling
  // it directly in the JSX below made the server always render the "publisher"
  // fallback while the client immediately rendered the real username, a
  // guaranteed hydration mismatch on every single page load.
  const [username, setUsername] = useState("publisher");

  useEffect(() => {
    const publisherId = getPublisherId();
    if (!publisherId) {
      router.replace("/login");
      return;
    }
    setUsername(getUsername() || "publisher");
    apiFetch(`/publisher/profile/${publisherId}`).then((r) => r.json()).then((d) => d?.newspaper_name && setNewspaperName(d.newspaper_name)).catch(() => {});
    apiFetch(`/publisher/wallet/${publisherId}`).then((r) => r.json()).then((d) => d?.balance_inr !== undefined && setBalance(Number(d.balance_inr))).catch(() => {});
  }, [router]);

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex w-64 bg-black text-gray-100 flex-col">
          <div className="h-16 px-6 border-b border-gray-800 flex items-center font-bold">पब्लिशर पोर्टल</div>
          <div className="px-4 py-5 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-white text-black flex items-center justify-center text-sm font-bold">{initials(newspaperName)}</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{newspaperName}</div>
                <div className="text-xs text-gray-400">{username}</div>
              </div>
            </div>
            <div className="mt-4 bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-400">वॉलेट बैलेंस</div>
              <div className="text-xl font-bold">{balance !== null ? `₹${balance.toFixed(2)}` : "..."}</div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-5 space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={`block px-3.5 py-2.5 rounded-lg text-sm font-medium ${active ? "bg-white text-black" : "text-gray-300 hover:bg-gray-900 hover:text-white"}`}>
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="px-3 py-4 border-t border-gray-800 space-y-2">
            <Link href="/wizard" className="block px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-900">सेटअप विज़ार्ड</Link>
            <button onClick={logout} className="w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-900">लॉग आउट</button>
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8">
            <div>
              <div className="text-sm font-semibold text-gray-900">{newspaperName}</div>
              <div className="text-xs text-gray-500">न्यूज़पेपर जनरेटर मैनेजमेंट</div>
            </div>
            <div className="lg:hidden flex gap-2 text-xs">
              {NAV.map((item) => <Link key={item.href} href={item.href} className="font-semibold text-gray-700">{item.name}</Link>)}
            </div>
          </header>
          <main className="p-4 sm:p-8 max-w-6xl">{children}</main>
        </div>
      </div>
    </div>
  );
}
