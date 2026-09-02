"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Wallet, Newspaper, User, Settings, HelpCircle } from "lucide-react";
import { apiFetch, clearSession, getPublisherId, getUsername } from "@/lib/api";
import { PageMintBadge, PageMintLockup } from "@/components/PageMintLogo";
import { isTourEnabled, setTourEnabled, startTour, TOUR_SETTING_EVENT } from "@/components/tour/tourSteps";

const NAV = [
  { name: "डैशबोर्ड", short: "होम", href: "/dashboard", icon: Home },
  { name: "वॉलेट", short: "वॉलेट", href: "/wallet", icon: Wallet },
  { name: "पुराने अंक", short: "अंक", href: "/history", icon: Newspaper },
  { name: "प्रोफाइल", short: "प्रोफ़ाइल", href: "/profile", icon: User },
  { name: "सेटिंग्स", short: "सेटिंग", href: "/settings", icon: Settings },
];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "NP";
}

export default function PublisherWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [newspaperName, setNewspaperName] = useState("पब्लिशर");
  const [balance, setBalance] = useState<number | null>(null);
  const [tourOn, setTourOn] = useState(true);
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
    setTourOn(isTourEnabled());
    apiFetch(`/publisher/profile/${publisherId}`).then((r) => r.json()).then((d) => d?.newspaper_name && setNewspaperName(d.newspaper_name)).catch(() => {});
    apiFetch(`/publisher/wallet/${publisherId}`).then((r) => r.json()).then((d) => d?.balance_inr !== undefined && setBalance(Number(d.balance_inr))).catch(() => {});
  }, [router]);

  useEffect(() => {
    const onTourSettingChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { on?: boolean } : null;
      setTourOn(typeof detail?.on === "boolean" ? detail.on : isTourEnabled());
    };
    window.addEventListener(TOUR_SETTING_EVENT, onTourSettingChange);
    return () => window.removeEventListener(TOUR_SETTING_EVENT, onTourSettingChange);
  }, []);

  const logout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <div className="min-h-screen text-gray-900">
      <div className="flex min-h-screen">
        <aside className="sidebar-shell hidden w-64 flex-col text-gray-100 lg:flex">
          <div className="flex h-16 items-center border-b border-white/10 px-5">
            <PageMintLockup size={34} tone="light" subtitle="पब्लिशर पोर्टल" />
          </div>
          <div className="border-b border-white/10 px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-lg shadow-emerald-900/40">
                {initials(newspaperName)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{newspaperName}</div>
                <div className="truncate text-xs text-white/45">{username}</div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.06] p-3.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-white/45">वॉलेट बैलेंस</div>
              <div className="numeric mt-0.5 text-2xl font-bold text-white">
                {balance !== null ? `₹${balance.toFixed(2)}` : "…"}
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-5">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                    active ? "is-active" : "text-white/65"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.3 : 1.9} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-1 border-t border-white/10 px-3 py-4">
            <Link href="/wizard" className="nav-item block rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/55">सेटअप विज़ार्ड</Link>
            <button onClick={logout} className="nav-item w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-white/55">लॉग आउट</button>
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          {/* Sticky app bar. On phones this is the native title bar: it sits
              under the status bar via pt-safe and stays put while the screen
              scrolls, rather than scrolling away like a web header. */}
          {/* Sticky only on phones, where it is the app's title bar. Desktop
              keeps the plain header it always had. */}
          <header className="glass-bar sticky top-0 z-40 border-b pt-safe lg:static">
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-8 lg:h-16">
              <div className="flex min-w-0 items-center gap-3">
                {/* Phones have no sidebar, so the mark rides in the bar. */}
                <span className="lg:hidden">
                  <PageMintBadge size={30} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-950">{newspaperName}</div>
                  <div className="truncate text-[11px] text-gray-500 lg:text-xs">न्यूज़पेपर जनरेटर मैनेजमेंट</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Replays the guided tour. Only on the dashboard, which is
                    the only screen carrying tour targets. */}
                {pathname === "/dashboard" && (
                  <div className="tour-toolbar" aria-label="ट्यूटोरियल कंट्रोल">
                    <button
                      type="button"
                      onClick={() => startTour()}
                      aria-label="ट्यूटोरियल दोबारा देखें"
                      title="ट्यूटोरियल दोबारा देखें"
                      className="tap help-btn"
                    >
                      <HelpCircle className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tourOn}
                      aria-label="ट्यूटोरियल auto start चालू या बंद करें"
                      title={tourOn ? "ट्यूटोरियल auto start चालू है" : "ट्यूटोरियल auto start बंद है"}
                      className={`switch switch-compact${tourOn ? " is-on" : ""}`}
                      onClick={() => {
                        const next = !tourOn;
                        setTourOn(next);
                        setTourEnabled(next);
                        if (next) window.setTimeout(() => startTour(), 120);
                      }}
                    >
                      <span className="switch-knob" />
                    </button>
                  </div>
                )}

                {/* The sidebar carries the balance on desktop; on phones there
                    is no sidebar, so it rides here where it stays visible. */}
                <Link
                  href="/wallet"
                  data-tour="wallet-chip"
                  className="tap numeric flex min-h-[38px] shrink-0 items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-3.5 text-sm font-bold text-white shadow-[0_6px_16px_-8px_rgba(5,150,105,0.9)] lg:hidden"
                >
                  {balance !== null ? `₹${balance.toFixed(0)}` : "₹…"}
                </Link>
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-8 max-w-6xl pb-tabbar lg:pb-8 animate-screen-in">{children}</main>
        </div>
      </div>

      {/* Bottom tab bar -- phones only; desktop keeps the sidebar. */}
      <nav className="glass-bar fixed inset-x-0 bottom-0 z-50 border-t pb-safe-min lg:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`tab-item ${active ? "is-active" : ""}`}
              >
                <span className="tab-icon">
                  <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.4 : 1.9} />
                </span>
                {item.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
