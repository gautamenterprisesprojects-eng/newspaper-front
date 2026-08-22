"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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

function downloadPdf(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
      <div><h1 className="text-2xl font-bold text-gray-900">पब्लिशर आवेदन</h1><p className="text-sm text-gray-500 mt-1">नए पब्लिशर को approve या reject करें.</p></div>
      {toast && <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium">{toast}</div>}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
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
    <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full p-6 space-y-4">
        <div><h2 className="font-bold text-gray-950">Credentials जारी करें</h2><p className="text-xs text-gray-500">{request.newspaper_name}</p></div>
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input value={pass} onChange={(e) => setPass(e.target.value)} minLength={6} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <input value={pdfPass} onChange={(e) => setPdfPass(e.target.value)} minLength={6} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <p className="text-xs text-amber-700">PDF lock password संभालकर रखें. यह recover नहीं होगा.</p>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold">रद्द</button><button disabled={loading} className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold">{loading ? "बन रहा है..." : "Approve करें"}</button></div>
      </form>
    </div>
  );
}
