"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, saveSession } from "@/lib/api";
import { PageMintBadge } from "@/components/PageMintLogo";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        setErrorMsg("यूज़र आईडी या पासवर्ड सही नहीं है.");
        return;
      }
      saveSession({ token: data.token, username: data.username, role: data.role || "PUBLISHER", publisher_id: data.publisher_id });
      if (data.role === "ADMIN") router.push("/saas-admin");
      else if (!data.is_setup_completed) router.push("/wizard");
      else router.push("/dashboard");
    } catch {
      setErrorMsg("Server से संपर्क नहीं हो पाया. कृपया backend चालू करें.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <form
        onSubmit={handleLogin}
        className="rise-in w-full max-w-md space-y-5 rounded-2xl bg-white p-6 sm:border sm:border-[color:var(--hairline)] sm:p-8 sm:shadow-[var(--shadow-lift)]"
      >
        <div className="text-center">
          <div className="mx-auto w-fit">
            <PageMintBadge size={52} />
          </div>
          <h1 className="page-title mt-4 text-2xl font-bold">लॉगिन</h1>
          <p className="mt-1 text-sm text-gray-500">एडमिन से मिली यूज़र आईडी और पासवर्ड डालें.</p>
        </div>
        {errorMsg && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium text-center">{errorMsg}</div>}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">यूज़र आईडी</label>
          {/* autoCapitalize/autoCorrect off: phone keyboards otherwise
              capitalise and autocorrect the first character of a username,
              which silently breaks the login for the user. */}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 sm:rounded-lg sm:py-2.5 sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">पासवर्ड</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 sm:rounded-lg sm:py-2.5 sm:text-sm"
          />
          <p className="mt-2 text-xs text-gray-500">पासवर्ड भूल गए हैं तो अपने एडमिन से नया पासवर्ड लें.</p>
        </div>
        <button
          disabled={loading}
          className="tap btn-brand w-full rounded-xl py-3.5 text-base font-semibold disabled:opacity-50 sm:rounded-lg sm:py-2.5 sm:text-sm"
        >
          {loading ? "जांच हो रही है..." : "लॉगिन करें"}
        </button>
      </form>
    </div>
  );
}
