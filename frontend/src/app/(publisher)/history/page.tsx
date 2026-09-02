"use client";

import React, { useEffect, useState } from "react";
import { apiFetch, getPublisherId } from "@/lib/api";
import { openExternal } from "@/lib/saveFile";

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
          <h1 className="page-title text-2xl font-bold">पुराने अंक</h1>
          <p className="text-sm text-gray-600 mt-1">पहले बने PDF और उनका खर्च देखें.</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="अंक या तारीख खोजें"
          type="search"
          enterKeyHint="search"
          className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black sm:w-64 sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm"
        />
      </div>

      {/* A 5-column table cannot be read on a 390px screen without pinch
          zoom, which this app disables. Phones get one card per issue; the
          table returns at lg where it fits honestly. */}
      <div className="space-y-3 sm:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-gray-400">कोई अंक नहीं मिला.</div>
        ) : (
          rows.map((pdf, i) => (
            <div key={pdf.id || i} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-950">{pdf.issue_number_ank}</div>
                  <div className="mt-0.5 text-sm text-gray-500">{String(pdf.publication_date || "").split("T")[0]}</div>
                </div>
                {/* target="_blank" is frequently a no-op inside a WebView, so
                    this goes through openExternal, which uses the shell's
                    in-app browser when there is one. */}
                <button
                  type="button"
                  onClick={() => void openExternal(pdf.pdf_url)}
                  className="tap btn-ink shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold"
                >
                  खोलें
                </button>
              </div>
              <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3 text-sm">
                <span className="text-gray-500">{pdf.page_count} पेज</span>
                <span className="font-mono font-semibold text-gray-900">₹{Number(pdf.cost_inr || 0).toFixed(2)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden surface-card sm:block">
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
                <td className="px-5 py-4 text-right"><button type="button" onClick={() => void openExternal(pdf.pdf_url)} className="font-semibold underline">खोलें</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
