"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, saveSession } from "@/lib/api";

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
    <div className="min-h-[70vh] flex items-center justify-center">
      <form onSubmit={handleLogin} className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-8 space-y-5">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-lg bg-black text-white flex items-center justify-center font-bold text-xl">N</div>
          <h1 className="mt-4 text-2xl font-bold text-gray-950">लॉगिन</h1>
          <p className="mt-1 text-sm text-gray-500">एडमिन से मिली यूज़र आईडी और पासवर्ड डालें.</p>
        </div>
        {errorMsg && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium text-center">{errorMsg}</div>}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">यूज़र आईडी</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">पासवर्ड</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          <p className="mt-2 text-xs text-gray-500">पासवर्ड भूल गए हैं तो अपने एडमिन से नया पासवर्ड लें.</p>
        </div>
        <button disabled={loading} className="w-full py-2.5 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
          {loading ? "जांच हो रही है..." : "लॉगिन करें"}
        </button>
      </form>
    </div>
  );
}
