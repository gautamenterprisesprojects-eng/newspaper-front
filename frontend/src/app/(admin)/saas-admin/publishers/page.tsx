"use client";

import React, { useEffect, useState } from "react";
import { API_BASE, apiFetch, getToken } from "@/lib/api";
import { saveBase64, saveFile } from "@/lib/saveFile";

interface Publisher {
  id: string;
  username: string;
  newspaper_name: string;
  publisher_name: string;
  balance_inr: string | number;
  is_active: boolean;
  password: string | null;
  settings_locked: boolean;
}

function randomPassword(prefix = "Pub") {
  return `${prefix}@${Math.random().toString(36).slice(2, 10)}`;
}

function usernameFrom(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "publisher";
}

// Goes through saveBase64 so the PDF is actually written and shared inside
// the wrapped app; a bare <a download> is inert in a WebView. See
// lib/saveFile.ts.
async function downloadPdf(base64: string, filename: string) {
  return saveBase64(base64, filename, "application/pdf", { shareTitle: filename });
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
    const filename = `${pub.username}-credentials.pdf`;
    const saved = await saveFile(await res.blob(), filename, { shareTitle: filename });
    if (!saved.ok) setToast(`PDF सेव नहीं हो सका: ${saved.error}`);
  };

  const rows = publishers.filter((p) =>
    `${p.username} ${p.newspaper_name} ${p.publisher_name}`.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleActive = async (pub: Publisher) => {
    const nextActive = !pub.is_active;
    const verb = nextActive ? "reactivate" : "suspend";
    if (!window.confirm(`${pub.newspaper_name || pub.username} को ${nextActive ? "फिर से सक्रिय" : "निलंबित"} करें?`)) return;
    const res = await apiFetch(`/saas-admin/publishers/${pub.id}/set-active`, {
      method: "POST",
      body: JSON.stringify({ is_active: nextActive }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setToast(data?.error || `Publisher ${verb} नहीं हो सका.`);
      return;
    }
    setToast(nextActive ? "Publisher फिर से सक्रिय हो गया." : "Publisher निलंबित कर दिया गया.");
    load();
  };

  const unlockSettings = async (pub: Publisher) => {
    if (!window.confirm(`${pub.newspaper_name || pub.username} की settings unlock करें? इसके बाद वो publisher दोबारा settings भर सकेगा.`)) return;
    const res = await apiFetch(`/saas-admin/publishers/${pub.id}/unlock-settings`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      setToast(data?.error || "Settings unlock नहीं हो सकीं.");
      return;
    }
    setToast("Settings unlock हो गईं.");
    load();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold">पब्लिशर</h1>
          <p className="text-sm text-gray-500 mt-1">पब्लिशर ID, password, wallet और credentials manage करें.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="खोजें"
            type="search"
            enterKeyHint="search"
            className="w-full rounded-xl border border-gray-300 px-3.5 py-3 text-base sm:w-64 sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm"
          />
          <button onClick={() => setCreateOpen(true)} className="tap shrink-0 btn-brand rounded-xl px-4 py-3 text-sm font-semibold sm:rounded-lg sm:py-2">नया पब्लिशर</button>
        </div>
      </div>

      {toast && <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium">{toast}</div>}

      {/* Phones: card per publisher. The action row here is the reason the
          table can't just scroll sideways -- these are the controls an admin
          actually comes to this screen to press. */}
      <div className="space-y-3 sm:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-gray-400">कोई पब्लिशर नहीं मिला.</div>
        ) : (
          rows.map((pub) => (
            <div key={pub.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-950">{pub.newspaper_name || "-"}</div>
                  <div className="truncate text-xs text-gray-500">{pub.publisher_name || "-"}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    pub.is_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {pub.is_active ? "Active" : "Suspended"}
                </span>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-semibold text-gray-900">{pub.username}</div>
                  <div className="truncate font-mono text-xs text-gray-500">{pub.password || "password उपलब्ध नहीं"}</div>
                </div>
                <div className="shrink-0 font-mono font-bold text-gray-900">₹{Number(pub.balance_inr || 0).toFixed(2)}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => downloadCredentials(pub)} className="tap rounded-xl border border-gray-300 py-2.5 text-xs font-semibold">PDF</button>
                <button onClick={() => setWalletPub(pub)} className="tap rounded-xl border border-gray-300 py-2.5 text-xs font-semibold">Wallet</button>
                <button onClick={() => setResetPub(pub)} className="tap btn-ink rounded-xl py-2.5 text-xs font-semibold">Password</button>
                <button
                  onClick={() => toggleActive(pub)}
                  className={`tap rounded-xl border py-2.5 text-xs font-semibold ${
                    pub.is_active ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"
                  }`}
                >
                  {pub.is_active ? "Suspend" : "Reactivate"}
                </button>
                {pub.settings_locked && (
                  <button onClick={() => unlockSettings(pub)} className="tap col-span-2 rounded-xl border border-amber-400 bg-amber-50 py-2.5 text-xs font-semibold text-amber-800">
                    Unlock settings
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-hidden surface-card sm:block">
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
                <td className="px-5 py-4">
                  <span className={pub.is_active ? "text-green-700" : "text-red-700"}>
                    {pub.is_active ? "Active" : "Suspended"}
                  </span>
                </td>
                <td className="px-5 py-4 text-right font-mono">₹{Number(pub.balance_inr || 0).toFixed(2)}</td>
                <td className="px-5 py-4 text-right space-x-2">
                  <button onClick={() => downloadCredentials(pub)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold">PDF</button>
                  <button onClick={() => setWalletPub(pub)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold">Wallet</button>
                  <button onClick={() => setResetPub(pub)} className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold">Password</button>
                  <button
                    onClick={() => toggleActive(pub)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                      pub.is_active
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-green-300 bg-green-50 text-green-700"
                    }`}
                  >
                    {pub.is_active ? "Suspend" : "Reactivate"}
                  </button>
                  {pub.settings_locked && (
                    <button onClick={() => unlockSettings(pub)} className="px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 text-xs font-semibold">Unlock settings</button>
                  )}
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
