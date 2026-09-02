"use client";

import React, { useEffect, useState } from "react";
import { apiFetch, getPublisherId } from "@/lib/api";

export default function PublisherWalletPage() {
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState(2500);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const publisherId = getPublisherId();
    if (!publisherId) return;
    const d = await apiFetch(`/publisher/wallet/${publisherId}`).then((r) => r.json());
    if (d?.balance_inr !== undefined) setBalance(Number(d.balance_inr));
    setTransactions(d?.recent_transactions || []);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("insufficient") === "1") {
      const required = params.get("required");
      setNotice(required ? `अंक बनाने के लिए कम से कम ₹${required} चाहिए. कृपया रिचार्ज करें.` : "बैलेंस कम है. कृपया रिचार्ज करें.");
    }
    load().catch(() => {});
  }, []);

  const recharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const publisherId = getPublisherId();
    if (!publisherId) {
      setNotice("Session नहीं मिला. कृपया दोबारा लॉगिन करें.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/publisher/wallet/recharge", {
        method: "POST",
        body: JSON.stringify({
          publisher_id: publisherId,
          amount_inr: amount,
          razorpay_order_id: "order_local_demo",
          razorpay_payment_id: `pay_local_${Date.now()}`,
        }),
      });
      const data = await res.json().catch(() => null);
      setNotice(res.ok && data?.success ? `₹${amount.toFixed(2)} वॉलेट में जुड़ गया.` : data?.error || "रिचार्ज नहीं हो सका.");
      await load();
    } catch {
      setNotice("API से संपर्क नहीं हो पाया.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rise-in">
        <h1 className="page-title text-2xl font-bold">वॉलेट</h1>
        <p className="text-sm text-gray-600 mt-1">Generator खोलने से पहले यहीं से बैलेंस और रिचार्ज मैनेज करें.</p>
      </div>
      {notice && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">{notice}</div>}
      <div className="stagger grid gap-5 lg:grid-cols-3">
        <div className="hero-panel rise-in p-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/70">मौजूदा बैलेंस</div>
          <div className="numeric mt-2 text-4xl font-bold">₹{balance.toFixed(2)}</div>
        </div>
        <form onSubmit={recharge} className="surface-card rise-in space-y-4 p-6 lg:col-span-2">
          <h2 className="font-bold text-gray-950">रिचार्ज करें</h2>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {[1000, 2500, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(v)}
                className={`tap numeric min-h-[48px] rounded-xl border px-4 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:rounded-lg ${
                  amount === v ? "chip-active" : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                ₹{v.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
          {/* inputMode numeric rather than type=number: the spinner arrows are
              useless on touch and type=number drops leading-zero handling. */}
          <input
            type="number"
            inputMode="numeric"
            min={100}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="numeric w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 sm:max-w-xs sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm"
          />
          <button
            disabled={loading || amount <= 0}
            className="tap btn-brand w-full rounded-xl py-3.5 text-base font-semibold disabled:opacity-50 sm:w-auto sm:rounded-lg sm:px-5 sm:py-2.5 sm:text-sm"
          >
            {loading ? "रिचार्ज हो रहा है..." : "रिचार्ज करें"}
          </button>
        </form>
      </div>

      <div className="space-y-3 sm:hidden">
        {transactions.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-gray-400">अभी कोई लेन-देन नहीं है.</div>
        ) : (
          transactions.map((tx, i) => {
            const amt = Number(tx.amount_inr || 0);
            const credit = amt >= 0;
            return (
              <div key={tx.id || i} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{tx.description || "लेन-देन"}</div>
                    <div className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">{tx.txn_type}</div>
                  </div>
                  <div className={`shrink-0 font-mono font-bold ${credit ? "text-emerald-700" : "text-gray-900"}`}>
                    {credit ? "+" : "−"}₹{Math.abs(amt).toFixed(2)}
                  </div>
                </div>
                <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
                  बैलेंस: ₹{Number(tx.balance_after_inr || balance).toFixed(2)}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden overflow-hidden surface-card sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr><th className="text-left px-5 py-3">विवरण</th><th className="text-left px-5 py-3">प्रकार</th><th className="text-right px-5 py-3">राशि</th><th className="text-right px-5 py-3">बैलेंस</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.length === 0 ? <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">अभी कोई लेन-देन नहीं है.</td></tr> : transactions.map((tx, i) => (
              <tr key={tx.id || i}>
                <td className="px-5 py-4 text-gray-900">{tx.description || "लेन-देन"}</td>
                <td className="px-5 py-4 text-gray-600">{tx.txn_type}</td>
                <td className="px-5 py-4 text-right font-mono">₹{Math.abs(Number(tx.amount_inr || 0)).toFixed(2)}</td>
                <td className="px-5 py-4 text-right font-mono">₹{Number(tx.balance_after_inr || balance).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
