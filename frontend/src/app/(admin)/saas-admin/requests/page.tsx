"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { saveBase64 } from "@/lib/saveFile";

interface RegistrationRequest {
  id: string;
  owner_name: string;
  newspaper_name: string;
  mobile: string;
  email: string;
  city: string;
  state: string;
  publication_type: string;
  rni_number: string;
  status: string;
}

function password(prefix: string) {
  return `${prefix}@${Math.random().toString(36).slice(2, 10)}`;
}

function usernameFrom(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "publisher";
}

// Via saveBase64 so the credentials PDF is written and shared inside the
// wrapped app rather than vanishing; see lib/saveFile.ts.
async function downloadPdf(base64: string, filename: string) {
  return saveBase64(base64, filename, "application/pdf", { shareTitle: filename });
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [approving, setApproving] = useState<RegistrationRequest | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiFetch("/saas-admin/overview").then((r) => r.json());
      setRequests(((d?.registration_requests || []) as RegistrationRequest[]).filter((r) => r.status === "PENDING"));
    } catch {
      setToast("आवेदन लोड नहीं हो सके.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const reject = async (req: RegistrationRequest) => {
    if (!confirm(`${req.newspaper_name} का आवेदन reject करें?`)) return;
    const res = await apiFetch("/saas-admin/request/reject", { method: "POST", body: JSON.stringify({ request_id: req.id }) });
    setToast(res.ok ? "आवेदन reject हो गया." : "Reject नहीं हो सका.");
    await load();
  };

  return (
    <div className="space-y-8">
      <div><h1 className="page-title text-2xl font-bold">पब्लिशर आवेदन</h1><p className="text-sm text-gray-500 mt-1">नए पब्लिशर को approve या reject करें.</p></div>
      {toast && <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium">{toast}</div>}
      {/* Phones: one card per applicant. The desktop table's five columns
          (applicant / paper / place / RNI / actions) cannot survive 390px. */}
      <div className="space-y-3 sm:hidden">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-gray-400">लोड हो रहा है...</div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-gray-400">कोई pending आवेदन नहीं है.</div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="surface-card p-4">
              <div className="font-semibold text-gray-950">{req.newspaper_name}</div>
              <div className="text-xs text-gray-500">{req.publication_type}</div>
              <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">आवेदक</dt>
                  <dd className="min-w-0 truncate text-right font-medium text-gray-900">{req.owner_name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">ईमेल</dt>
                  <dd className="min-w-0 truncate text-right text-gray-700">{req.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">जगह</dt>
                  <dd className="text-right text-gray-700">{req.city}, {req.state}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">मोबाइल</dt>
                  <dd className="text-right"><a href={`tel:${req.mobile}`} className="font-medium text-emerald-700">{req.mobile}</a></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">RNI</dt>
                  <dd className="text-right font-mono text-xs text-gray-700">{req.rni_number || "-"}</dd>
                </div>
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => reject(req)} className="tap rounded-xl border border-gray-300 py-3 text-sm font-semibold">Reject</button>
                <button onClick={() => setApproving(req)} className="tap rounded-xl bg-black py-3 text-sm font-semibold text-white">Approve</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden surface-card sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th className="px-5 py-3">आवेदक</th><th className="px-5 py-3">अखबार</th><th className="px-5 py-3">जगह</th><th className="px-5 py-3">RNI</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={5} className="py-10 text-center text-gray-400">लोड हो रहा है...</td></tr> : requests.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-gray-400">कोई pending आवेदन नहीं है.</td></tr> : requests.map((req) => (
              <tr key={req.id}>
                <td className="px-5 py-4"><div className="font-semibold">{req.owner_name}</div><div className="text-xs text-gray-500">{req.email}</div></td>
                <td className="px-5 py-4"><div className="font-semibold">{req.newspaper_name}</div><div className="text-xs text-gray-500">{req.publication_type}</div></td>
                <td className="px-5 py-4">{req.city}, {req.state}<div className="text-xs text-gray-500">{req.mobile}</div></td>
                <td className="px-5 py-4 font-mono text-xs">{req.rni_number || "-"}</td>
                <td className="px-5 py-4 text-right space-x-2"><button onClick={() => reject(req)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold">Reject</button><button onClick={() => setApproving(req)} className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold">Approve</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {approving && <ApproveModal request={approving} onClose={() => setApproving(null)} onDone={(m) => { setApproving(null); setToast(m); load(); }} />}
    </div>
  );
}

function ApproveModal({ request, onClose, onDone }: { request: RegistrationRequest; onClose: () => void; onDone: (message: string) => void }) {
  const [username, setUsername] = useState(usernameFrom(request.newspaper_name));
  const [pass, setPass] = useState(password("Pub"));
  const [pdfPass, setPdfPass] = useState(password("Lock"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/saas-admin/request/approve", { method: "POST", body: JSON.stringify({ request_id: request.id, username, password: pass, pdf_password: pdfPass }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Approve नहीं हो सका.");
        return;
      }
      downloadPdf(data.credentials_pdf_base64, `${username}-credentials.pdf`);
      onDone("पब्लिशर approve हो गया और credentials PDF download हो गया.");
    } catch {
      setError("API से संपर्क नहीं हो पाया.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="animate-sheet-scrim-in absolute inset-0" onClick={onClose} />
      <form
        onSubmit={submit}
        className="animate-sheet-in sm:animate-dialog-in relative max-h-[88dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl border-gray-200 bg-white p-5 pb-safe shadow-xl sm:max-w-md sm:rounded-2xl sm:border sm:p-6 sm:pb-6"
      >
        <div className="flex justify-center sm:hidden"><div className="h-1.5 w-10 rounded-full bg-gray-300" /></div>
        <div><h2 className="font-bold text-gray-950">Credentials जारी करें</h2><p className="text-xs text-gray-500">{request.newspaper_name}</p></div>
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base sm:py-2 sm:text-sm" />
        <input value={pass} onChange={(e) => setPass(e.target.value)} minLength={6} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full rounded-xl border border-gray-300 px-3.5 py-3 font-mono text-base sm:py-2 sm:text-sm" />
        <input value={pdfPass} onChange={(e) => setPdfPass(e.target.value)} minLength={6} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full rounded-xl border border-gray-300 px-3.5 py-3 font-mono text-base sm:py-2 sm:text-sm" />
        <p className="text-xs text-amber-700">PDF lock password संभालकर रखें. यह recover नहीं होगा.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="tap rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold sm:py-2">रद्द</button>
          <button disabled={loading} className="tap btn-brand rounded-xl px-4 py-3 text-sm font-semibold sm:py-2">{loading ? "बन रहा है..." : "Approve करें"}</button>
        </div>
      </form>
    </div>
  );
}
