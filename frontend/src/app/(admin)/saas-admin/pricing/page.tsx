"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function AdminPricingPage() {
  const [currentRate, setCurrentRate] = useState<number | null>(null);
  const [newRate, setNewRate] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/auth/pricing").then((r) => r.json()).then((d) => {
      if (d?.per_page_cost_inr) {
        setCurrentRate(Number(d.per_page_cost_inr));
        setNewRate(Number(d.per_page_cost_inr));
      }
    }).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch("/saas-admin/pricing-update", { method: "POST", body: JSON.stringify({ per_page_cost_inr: newRate }) });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setCurrentRate(newRate);
        setToast(`दर ₹${newRate}/पेज हो गई.`);
      } else setToast(data?.error || "दर सेव नहीं हो सकी.");
    } catch {
      setToast("API से संपर्क नहीं हो पाया.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-xl">
      <div><h1 className="page-title text-2xl font-bold">दर</h1><p className="text-sm text-gray-500 mt-1">हर generation पर wallet से कटने वाली प्रति पेज दर.</p></div>
      {toast && <div className="p-4 rounded-lg text-sm font-medium border bg-gray-50 border-gray-200 text-gray-700">{toast}</div>}
      <div className="surface-card p-6"><div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">मौजूदा दर</div><div className="text-3xl font-bold text-gray-900 mt-1">{currentRate !== null ? `₹${currentRate} / पेज` : "-"}</div></div>
      <form onSubmit={submit} className="surface-card p-6 space-y-5">
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">नई दर (₹ प्रति पेज)</label>
        <input type="number" min={1} max={5000} value={newRate} onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)} className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black" />
        <button disabled={submitting || newRate <= 0} className="block px-5 py-2.5 rounded-lg text-sm font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-50">{submitting ? "सेव हो रहा है..." : "दर लागू करें"}</button>
      </form>
    </div>
  );
}
