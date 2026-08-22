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
      <div>
        <h1 className="text-2xl font-bold text-gray-950">वॉलेट</h1>
        <p className="text-sm text-gray-600 mt-1">Generator खोलने से पहले यहीं से बैलेंस और रिचार्ज मैनेज करें.</p>
      </div>
      {notice && <div className="p-4 rounded-lg bg-gray-100 border border-gray-200 text-sm font-medium text-gray-800">{notice}</div>}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="text-xs font-semibold text-gray-500">मौजूदा बैलेंस</div>
          <div className="mt-2 text-3xl font-bold text-gray-950">₹{balance.toFixed(2)}</div>
        </div>
        <form onSubmit={recharge} className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-gray-950">रिचार्ज करें</h2>
          <div className="flex flex-wrap gap-2">
            {[1000, 2500, 5000, 10000].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(v)} className={`px-4 py-2 rounded-lg border text-sm font-semibold ${amount === v ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"}`}>
                ₹{v.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
          <input type="number" min={100} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          <button disabled={loading || amount <= 0} className="px-5 py-2.5 rounded-lg bg-black text-white text-sm font-semibold disabled:opacity-50">
            {loading ? "रिचार्ज हो रहा है..." : "रिचार्ज करें"}
          </button>
        </form>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
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
