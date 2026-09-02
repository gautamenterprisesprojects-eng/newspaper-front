"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, saveSession } from "@/lib/api";
import { PageMintBadge } from "@/components/PageMintLogo";

// The one door an unenrolled browser is allowed through. The link an admin
// sends carries a one-time token; opening it parks that token in a
// short-lived cookie, which is what lets this browser reach the login form at
// all. The password is still required -- the link alone logs nobody in, and
// the account is bound to this browser only once a real login succeeds.

function EnrolForm() {
  const router = useRouter();
  const token = useSearchParams().get("t") || "";

  const [phase, setPhase] = useState<"checking" | "ready" | "dead">("checking");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setErrorMsg("यह लिंक अधूरा है. एडमिन से नया लिंक लें.");
      setPhase("dead");
      return;
    }
    apiFetch("/auth/enrol/begin", { method: "POST", body: JSON.stringify({ token }) })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setErrorMsg(data?.error || "यह लिंक अब काम नहीं करता. एडमिन से नया लिंक लें.");
          setPhase("dead");
          return;
        }
        setAccount(data?.username || "");
        setPhase("ready");
      })
      .catch(() => {
        setErrorMsg("Server से संपर्क नहीं हो पाया. थोड़ी देर बाद कोशिश करें.");
        setPhase("dead");
      });
  }, [token]);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: account, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        // The device-specific refusals carry their own message and are worth
        // showing verbatim -- "wrong password" and "this link is spent" need
        // very different responses from the person reading them.
        setErrorMsg(data?.error || "पासवर्ड सही नहीं है.");
        return;
      }
      saveSession({
        token: data.token,
        username: data.username,
        role: data.role || "PUBLISHER",
        publisher_id: data.publisher_id,
      });
      if (data.role === "ADMIN") router.push("/saas-admin");
      else if (!data.is_setup_completed) router.push("/wizard");
      else router.push("/dashboard");
    } catch {
      setErrorMsg("Server से संपर्क नहीं हो पाया.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70dvh] items-center justify-center">
      <div className="rise-in w-full max-w-md space-y-5 rounded-2xl bg-white p-6 sm:border sm:border-[color:var(--hairline)] sm:p-8 sm:shadow-[var(--shadow-lift)]">
        <div className="text-center">
          <div className="mx-auto w-fit">
            <PageMintBadge size={52} />
          </div>
          <h1 className="page-title mt-4 text-2xl font-bold">डिवाइस रजिस्टर करें</h1>
          <p className="mt-1 text-sm text-gray-500">
            यह अकाउंट सिर्फ़ इसी ब्राउज़र में खुलेगा. जिस ब्राउज़र में रोज़ काम करना है, उसी में यह लिंक खोलें.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium text-center">
            {errorMsg}
          </div>
        )}

        {phase === "checking" && <p className="text-center text-sm text-gray-500">लिंक जांचा जा रहा है...</p>}

        {phase === "dead" && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-center text-sm text-gray-600">
            नया लिंक लेने के लिए एडमिन से संपर्क करें:
            <br />
            <a href="tel:7999079051" className="font-semibold text-emerald-700">7999079051</a>
            <span className="text-gray-400"> · </span>
            <a href="https://wa.me/917999079051" className="font-semibold text-emerald-700">WhatsApp</a>
          </div>
        )}

        {phase === "ready" && (
          <form onSubmit={handleBind} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">यूज़र आईडी</label>
              {/* Fixed, not typed: the link already decided which account is
                  being enrolled, and a token issued for one account cannot
                  bind another. Showing it read-only removes a way to fail. */}
              <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-base font-semibold text-gray-800 sm:rounded-lg sm:py-2.5 sm:text-sm">
                {account}
              </div>
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
            </div>
            <button
              disabled={loading}
              className="tap btn-brand w-full rounded-xl py-3.5 text-base font-semibold disabled:opacity-50 sm:rounded-lg sm:py-2.5 sm:text-sm"
            >
              {loading ? "रजिस्टर हो रहा है..." : "इस ब्राउज़र को रजिस्टर करें"}
            </button>
            <p className="text-center text-xs text-gray-500">
              रजिस्टर होने के बाद यह लिंक बंद हो जाएगा. आगे रोज़ सीधे लॉगिन पेज से आएं.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function EnrolPage() {
  // useSearchParams needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={<div className="flex min-h-[70dvh] items-center justify-center text-sm text-gray-500">लोड हो रहा है...</div>}>
      <EnrolForm />
    </Suspense>
  );
}
