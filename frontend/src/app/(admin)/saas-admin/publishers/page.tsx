"use client";

import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch, getToken } from "@/lib/api";

interface Publisher {
  id: string;
  username: string;
  newspaper_name: string;
  publisher_name: string;
  balance_inr: string | number;
  is_active: boolean;
  password: string | null;
}

function randomPassword(prefix = "Pub") {
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

export default function AdminPublishersPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [walletPub, setWalletPub] = useState<Publisher | null>(null);
  const [resetPub, setResetPub] = useState<Publisher | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    try {
      const d = await apiFetch("/saas-admin/overview").then((r) => r.json());
      setPublishers(d?.publishers || []);
    } catch {
      setToast("पब्लिशर लोड नहीं हो सके.");
    }
  };

  useEffect(() => { load(); }, []);

  const downloadCredentials = async (pub: Publisher) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/saas-admin/publishers/${pub.id}/credentials-pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      setToast("Credentials PDF नहीं मिला.");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pub.username}-credentials.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const rows = publishers.filter((p) =>
    `${p.username} ${p.newspaper_name} ${p.publisher_name}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">पब्लिशर</h1>
          <p className="text-sm text-gray-500 mt-1">पब्लिशर ID, password, wallet और credentials manage करें.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="खोजें" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64" />
          <button onClick={() => setCreateOpen(true)} className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800">नया पब्लिशर</button>
        </div>
      </div>

      {toast && <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium">{toast}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-3">यूजर ID</th>
              <th className="px-5 py-3">अखबार</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">बैलेंस</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-gray-400">कोई पब्लिशर नहीं मिला.</td></tr>
            ) : rows.map((pub) => (
              <tr key={pub.id}>
                <td className="px-5 py-4">
                  <div className="font-mono font-semibold">{pub.username}</div>
                  <div className="text-xs text-gray-500 font-mono">{pub.password || "password उपलब्ध नहीं"}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold">{pub.newspaper_name || "-"}</div>
                  <div className="text-xs text-gray-500">{pub.publisher_name || "-"}</div>
                </td>
                <td className="px-5 py-4">{pub.is_active ? "Active" : "Inactive"}</td>
                <td className="px-5 py-4 text-right font-mono">₹{Number(pub.balance_inr || 0).toFixed(2)}</td>
                <td className="px-5 py-4 text-right space-x-2">
                  <button onClick={() => downloadCredentials(pub)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold">PDF</button>
                  <button onClick={() => setWalletPub(pub)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold">Wallet</button>
                  <button onClick={() => setResetPub(pub)} className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold">Password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && <CreatePublisherModal onClose={() => setCreateOpen(false)} onDone={(m) => { setCreateOpen(false); setToast(m); load(); }} />}
      {walletPub && <WalletModal pub={walletPub} onClose={() => setWalletPub(null)} onDone={(m) => { setWalletPub(null); setToast(m); load(); }} />}
      {resetPub && <ResetModal pub={resetPub} onClose={() => setResetPub(null)} onDone={(m) => { setResetPub(null); setToast(m); load(); }} />}
    </div>
  );
}

function CreatePublisherModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [publisherName, setPublisherName] = useState("");
  const [newspaperName, setNewspaperName] = useState("");
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState(randomPassword("Pub"));
  const [pdfPass, setPdfPass] = useState(randomPassword("Lock"));
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [publicationType, setPublicationType] = useState("Daily");
  const [initialBalance, setInitialBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!username && newspaperName) setUsername(usernameFrom(newspaperName));
  }, [newspaperName, username]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/saas-admin/publishers/create", {
        method: "POST",
        body: JSON.stringify({
          username,
          password: pass,
          pdf_password: pdfPass,
          publisher_name: publisherName,
          newspaper_name: newspaperName,
          publication_type: publicationType,
          mobile,
          email,
          city,
          state,
          initial_balance_inr: initialBalance,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "पब्लिशर नहीं बन सका.");
        return;
      }
      downloadPdf(data.credentials_pdf_base64, `${username}-credentials.pdf`);
      onDone("पब्लिशर बन गया. ID/password database में save हैं और credentials PDF download हो गया.");
    } catch {
      setError("API से संपर्क नहीं हो पाया.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="नया पब्लिशर बनाएं" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="पब्लिशर नाम" value={publisherName} onChange={setPublisherName} required />
          <Input label="अखबार का नाम" value={newspaperName} onChange={setNewspaperName} required />
          <Input label="यूजर ID" value={username} onChange={setUsername} required minLength={3} mono />
          <Input label="Login password" value={pass} onChange={setPass} required minLength={6} mono />
          <Input label="PDF lock password" value={pdfPass} onChange={setPdfPass} required minLength={6} mono />
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-600">Publication type</span>
            <select value={publicationType} onChange={(e) => setPublicationType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </label>
          <Input label="Mobile" value={mobile} onChange={setMobile} />
          <Input label="Email" value={email} onChange={setEmail} type="email" />
          <Input label="City" value={city} onChange={setCity} />
          <Input label="State" value={state} onChange={setState} />
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-600">शुरुआती wallet balance</span>
            <input type="number" min={0} value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold">रद्द</button>
          <button disabled={loading} className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold">{loading ? "बन रहा है..." : "पब्लिशर बनाएं"}</button>
        </div>
      </form>
    </Modal>
  );
}

function WalletModal({ pub, onClose, onDone }: { pub: Publisher; onClose: () => void; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState(500);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch(`/saas-admin/publishers/${pub.id}/wallet-adjust`, { method: "POST", body: JSON.stringify({ amount_inr: amount, reason }) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) setError(data?.error || "Wallet update नहीं हुआ.");
    else onDone(`Wallet update हो गया. नया बैलेंस ₹${Number(data.balance_after_inr).toFixed(2)}`);
  };

  return (
    <Modal title="Wallet बदलें" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-sm text-red-700">{error}</div>}
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="कारण" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold">सेव करें</button>
      </form>
    </Modal>
  );
}

function ResetModal({ pub, onClose, onDone }: { pub: Publisher; onClose: () => void; onDone: (m: string) => void }) {
  const [pass, setPass] = useState(randomPassword("Pub"));
  const [pdfPass, setPdfPass] = useState(randomPassword("Lock"));
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch(`/saas-admin/publishers/${pub.id}/reset-password`, { method: "POST", body: JSON.stringify({ new_password: pass, pdf_password: pdfPass }) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setError(data?.error || "Password reset नहीं हुआ.");
      return;
    }
    downloadPdf(data.credentials_pdf_base64, `${pub.username}-credentials.pdf`);
    onDone("Password reset हो गया और नया credentials PDF download हो गया.");
  };

  return (
    <Modal title="Password reset" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-sm text-red-700">{error}</div>}
        <input value={pass} onChange={(e) => setPass(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <input value={pdfPass} onChange={(e) => setPdfPass(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
        <button className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold">Reset करें</button>
      </form>
    </Modal>
  );
}

function Input({ label, value, onChange, type = "text", required, minLength, mono }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  mono?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
      <div className={`bg-white rounded-xl shadow-xl border border-gray-200 w-full p-6 space-y-4 ${wide ? "max-w-2xl" : "max-w-sm"}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-500">बंद</button>
        </div>
        {children}
      </div>
    </div>
  );
}
