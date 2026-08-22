"use client";

import React, { useEffect, useState } from "react";
import { apiFetch, getPublisherId } from "@/lib/api";

export default function PDFHistoryPage() {
  const [pdfs, setPdfs] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const publisherId = getPublisherId();
    if (!publisherId) return;
    apiFetch(`/publisher/history/${publisherId}?limit=100`).then((r) => r.json()).then((d) => setPdfs(d?.history || [])).catch(() => setPdfs([]));
  }, []);

  const rows = pdfs.filter((p) => `${p.issue_number_ank || ""} ${p.publication_date || ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">पुराने अंक</h1>
          <p className="text-sm text-gray-600 mt-1">पहले बने PDF और उनका खर्च देखें.</p>
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="अंक या तारीख खोजें" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-black" />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr><th className="text-left px-5 py-3">अंक</th><th className="text-left px-5 py-3">तारीख</th><th className="text-right px-5 py-3">पेज</th><th className="text-right px-5 py-3">खर्च</th><th className="text-right px-5 py-3">PDF</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">कोई अंक नहीं मिला.</td></tr> : rows.map((pdf, i) => (
              <tr key={pdf.id || i}>
                <td className="px-5 py-4 font-semibold text-gray-950">{pdf.issue_number_ank}</td>
                <td className="px-5 py-4 text-gray-600">{String(pdf.publication_date || "").split("T")[0]}</td>
                <td className="px-5 py-4 text-right">{pdf.page_count}</td>
                <td className="px-5 py-4 text-right font-mono">₹{Number(pdf.cost_inr || 0).toFixed(2)}</td>
                <td className="px-5 py-4 text-right"><a href={pdf.pdf_url} target="_blank" className="font-semibold underline">खोलें</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
