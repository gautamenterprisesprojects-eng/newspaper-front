"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface Metrics {
  total_publishers: number;
  pending_requests: number;
  total_pdfs_generated: number;
  total_revenue_inr: number;
}

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/saas-admin/overview").then((r) => r.json()).then((d) => d?.metrics ? setMetrics(d.metrics) : setError("डेटा लोड नहीं हो सका.")).catch(() => setError("API से संपर्क नहीं हो पाया."));
    apiFetch("/auth/pricing").then((r) => r.json()).then((d) => d?.per_page_cost_inr && setRate(Number(d.per_page_cost_inr))).catch(() => {});
  }, []);

  const cards = [
    { label: "कुल पब्लिशर", value: metrics?.total_publishers, href: "/saas-admin/publishers" },
    { label: "लंबित आवेदन", value: metrics?.pending_requests, href: "/saas-admin/requests" },
    { label: "बने हुए PDF", value: metrics?.total_pdfs_generated },
    { label: "कुल कमाई", value: metrics?.total_revenue_inr !== undefined ? `₹${Number(metrics.total_revenue_inr).toLocaleString("en-IN")}` : undefined },
  ];

  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-bold text-gray-900">ओवरव्यू</h1><p className="text-sm text-gray-500 mt-1">पूरे platform की स्थिति यहां देखें.</p></div>
      {error && <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((card) => {
          const box = <div className="p-6 rounded-xl border border-gray-200 shadow-sm bg-white hover:border-gray-300"><div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{card.label}</div><div className="text-3xl font-bold text-gray-900 mt-2">{card.value !== undefined ? card.value : "-"}</div></div>;
          return card.href ? <Link key={card.label} href={card.href}>{box}</Link> : <div key={card.label}>{box}</div>;
        })}
      </div>
      <div className="p-6 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">मौजूदा generation दर</div>
        <div className="text-2xl font-bold text-gray-900 mt-2">{rate !== null ? `₹${rate} / पेज` : "-"}</div>
        <Link href="/saas-admin/pricing" className="inline-block mt-3 text-sm font-semibold text-black underline underline-offset-2">दर बदलें</Link>
      </div>
    </div>
  );
}
