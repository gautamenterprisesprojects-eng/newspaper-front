"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

// The device screen. Every action here either locks somebody out or lets
// them back in, so each one states its outcome explicitly -- a silent failure
// on this page means a publisher sitting in front of a 403 with nobody
// knowing why.

interface DeviceRow {
  id: string;
  trust_level: string;
  user_agent: string;
  first_ip: string;
  last_ip: string;
  first_seen: string;
  last_seen: string;
  is_current: boolean;
}

interface PendingLink {
  expires_at: string;
  created_at: string;
}

interface AccountDevices {
  publisher_id: string;
  username: string;
  newspaper_name: string;
  role: string;
  slots_used: number;
  slots_total: number;
  devices: DeviceRow[];
  pending_link: PendingLink | null;
}

interface BlockRow {
  username: string;
  ip_address: string;
  user_agent: string;
  status: string;
  login_time: string;
}

// A raw user agent string is unreadable at a glance, and this table exists to
// be read at a glance.
function browserLabel(ua: string): string {
  if (!ua) return "अज्ञात ब्राउज़र";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "अन्य";
  const os = /iPhone|iPad/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "अभी";
  if (mins < 60) return `${mins} मिनट पहले`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} घंटे पहले`;
  return `${Math.round(hours / 24)} दिन पहले`;
}

function hoursLeft(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expire हो गया";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.round((diff % 3600000) / 60000);
  return hours > 0 ? `${hours}घं ${mins}मि बचे` : `${mins} मिनट बचे`;
}

const BLOCK_REASONS: Record<string, string> = {
  DEVICE_BLOCKED: "अनजान ब्राउज़र",
  DEVICE_SLOTS_FULL: "slots भरे थे",
  ENROLMENT_TOKEN_INVALID: "गलत/पुराना लिंक",
};

export default function AdminDevicesPage() {
  const [accounts, setAccounts] = useState<AccountDevices[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [gateEnabled, setGateEnabled] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issuedLink, setIssuedLink] = useState<{ username: string; link: string; expires_at: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{ device: DeviceRow; account: AccountDevices } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/saas-admin/devices");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(data?.error || "डिवाइस लिस्ट लोड नहीं हो सकी.");
        return;
      }
      // Defensive on both counts: a missing accounts array, and a null
      // devices array inside any account. This screen is the tool for
      // getting locked-out people back in, so it has to render even when
      // the payload is not what it expects.
      setAccounts(
        (data.accounts || []).map((account: AccountDevices) => ({
          ...account,
          devices: account.devices || [],
        })),
      );
      setGateEnabled(Boolean(data.gate_enabled));
      setLoadError(null);
    } catch {
      setLoadError("API से संपर्क नहीं हो पाया.");
    }
    try {
      const res = await apiFetch("/saas-admin/device-blocks");
      const data = await res.json().catch(() => null);
      if (res.ok) setBlocks(data.blocks || []);
    } catch {
      /* the block feed is informational; its failure must not blank the page */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const issueLink = async (account: AccountDevices) => {
    setBusyId(account.publisher_id);
    setNotice(null);
    try {
      const res = await apiFetch(`/saas-admin/publishers/${account.publisher_id}/enrolment-link`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ tone: "bad", text: data?.error || "लिंक नहीं बन पाया." });
        return;
      }
      setIssuedLink({ username: data.username, link: data.link, expires_at: data.expires_at });
      await load();
    } catch {
      setNotice({ tone: "bad", text: "API से संपर्क नहीं हो पाया." });
    } finally {
      setBusyId(null);
    }
  };

  const revokeDevice = async () => {
    if (!confirmRevoke) return;
    const { device, account } = confirmRevoke;
    setBusyId(device.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/saas-admin/devices/${device.id}/revoke`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ tone: "bad", text: data?.error || "Unbind नहीं हो पाया." });
        return;
      }
      setNotice({ tone: "ok", text: `${account.username} का device unbind हो गया. अब नया लिंक भेजें.` });
      setConfirmRevoke(null);
      await load();
    } catch {
      setNotice({ tone: "bad", text: "API से संपर्क नहीं हो पाया." });
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ tone: "ok", text: "लिंक कॉपी हो गया. WhatsApp पर भेज दें." });
    } catch {
      setNotice({ tone: "bad", text: "कॉपी नहीं हो पाया — लिंक को हाथ से सेलेक्ट करके कॉपी करें." });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title text-2xl font-bold">डिवाइस</h1>
        <p className="text-sm text-gray-500 mt-1">
          हर अकाउंट सिर्फ़ रजिस्टर किए हुए ब्राउज़र में खुलता है. पब्लिशर को एक, एडमिन को चार slots.
        </p>
      </div>

      {gateEnabled !== null && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium ${
            gateEnabled ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          {gateEnabled ? (
            <>डिवाइस लॉक <strong>चालू</strong> है — बिना रजिस्टर ब्राउज़र से URL नहीं खुलेगा.</>
          ) : (
            <>डिवाइस लॉक <strong>बंद</strong> है — अभी कोई भी ब्राउज़र लॉगिन कर सकता है. चालू करने के लिए सर्वर पर <code className="font-mono text-xs">DEVICE_GATE_ENABLED=true</code> करें.</>
          )}
        </div>
      )}

      {loadError && <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{loadError}</div>}
      {notice && (
        <div
          className={`p-4 rounded-lg border text-sm font-medium ${
            notice.tone === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="space-y-4">
        {accounts.map((account) => {
          const isAdmin = account.role === "ADMIN";
          const full = account.slots_used >= account.slots_total;
          return (
            <div key={account.publisher_id} className="p-5 surface-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{account.username}</span>
                    {isAdmin && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-900 text-white">admin</span>}
                    {account.slots_used === 0 && !account.pending_link && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700">रजिस्टर नहीं</span>
                    )}
                    {account.pending_link && account.slots_used < account.slots_total && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">लिंक भेजा है</span>
                    )}
                    {account.slots_used > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {account.slots_used} / {account.slots_total} रजिस्टर
                      </span>
                    )}
                  </div>
                  {account.newspaper_name && <div className="text-xs text-gray-500 mt-1">{account.newspaper_name}</div>}
                  {account.pending_link && (
                    <div className="text-xs text-amber-700 mt-1 font-medium">लिंक {hoursLeft(account.pending_link.expires_at)}</div>
                  )}
                </div>
                <button
                  onClick={() => issueLink(account)}
                  disabled={busyId === account.publisher_id || full}
                  title={full ? "सारे slots भरे हैं — पहले कोई device unbind करें" : ""}
                  className="tap rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold hover:border-gray-500 disabled:opacity-40"
                >
                  {busyId === account.publisher_id ? "बन रहा है..." : account.pending_link ? "नया लिंक बनाएं" : "लिंक बनाएं"}
                </button>
              </div>

              {account.devices.length === 0 ? (
                <p className="text-xs text-gray-500">कोई ब्राउज़र रजिस्टर नहीं है.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                        <th className="py-2 pr-4 font-semibold">ब्राउज़र</th>
                        <th className="py-2 pr-4 font-semibold">IP</th>
                        <th className="py-2 pr-4 font-semibold">आख़िरी बार</th>
                        <th className="py-2 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.devices.map((device) => (
                        <tr key={device.id} className="border-t border-gray-100">
                          <td className="py-2.5 pr-4">
                            {browserLabel(device.user_agent)}
                            {device.is_current && <span className="ml-2 text-xs font-semibold text-emerald-700">(यही ब्राउज़र)</span>}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-xs text-gray-600">{device.last_ip || device.first_ip || "—"}</td>
                          <td className="py-2.5 pr-4 text-gray-600">{timeAgo(device.last_seen)}</td>
                          <td className="py-2.5 text-right">
                            {device.is_current ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <button
                                onClick={() => setConfirmRevoke({ device, account })}
                                className="tap text-xs font-semibold text-red-700 hover:underline"
                              >
                                अनबाइंड
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-5 surface-card space-y-3">
        <div>
          <h2 className="font-bold text-gray-900">रोके गए प्रयास</h2>
          <p className="text-xs text-gray-500 mt-1">
            पब्लिशर फंसा है या कोई बाहर से कोशिश कर रहा है — यहीं से पता चलेगा. आख़िरी 50.
          </p>
        </div>
        {blocks.length === 0 ? (
          <p className="text-xs text-gray-500">अभी तक कोई प्रयास नहीं रुका.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-4 font-semibold">कब</th>
                  <th className="py-2 pr-4 font-semibold">अकाउंट</th>
                  <th className="py-2 pr-4 font-semibold">वजह</th>
                  <th className="py-2 pr-4 font-semibold">IP</th>
                  <th className="py-2 font-semibold">ब्राउज़र</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((block, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-2.5 pr-4 whitespace-nowrap text-gray-600">{timeAgo(block.login_time)}</td>
                    <td className="py-2.5 pr-4 font-semibold text-gray-900">{block.username}</td>
                    <td className="py-2.5 pr-4 text-gray-700">{BLOCK_REASONS[block.status] || block.status}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-600">{block.ip_address || "—"}</td>
                    <td className="py-2.5 text-gray-600">{browserLabel(block.user_agent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {issuedLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setIssuedLink(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="font-bold text-lg">{issuedLink.username} का रजिस्ट्रेशन लिंक</h2>
              <p className="text-sm text-gray-600 mt-1">
                यह लिंक <strong>{hoursLeft(issuedLink.expires_at)}</strong>. एक ही बार चलेगा — जिस ब्राउज़र में खोला जाएगा, अकाउंट उसी से बंध जाएगा.
              </p>
            </div>
            {/* Shown once and never again: only the hash is stored, so a lost
                link has to be re-issued rather than looked up. */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 font-mono text-xs break-all text-gray-800">{issuedLink.link}</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copyLink(issuedLink.link)} className="tap btn-brand rounded-lg px-4 py-2.5 text-sm font-semibold">लिंक कॉपी करें</button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`PageMint रजिस्ट्रेशन लिंक (24 घंटे में खोलें, सिर्फ़ एक बार चलेगा):\n${issuedLink.link}`)}`}
                target="_blank"
                rel="noreferrer"
                className="tap rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold hover:border-gray-500"
              >
                WhatsApp पर भेजें
              </a>
              <button onClick={() => setIssuedLink(null)} className="tap rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900">बंद करें</button>
            </div>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              यह लिंक दोबारा नहीं दिखेगा. बंद करने से पहले कॉपी कर लें.
            </p>
          </div>
        </div>
      )}

      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmRevoke(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg">{confirmRevoke.account.username} का device हटाएं?</h2>
            <p className="text-sm text-gray-600">
              {browserLabel(confirmRevoke.device.user_agent)} अभी इस अकाउंट से बंधा है. हटाते ही यह अकाउंट उस ब्राउज़र में
              नहीं खुलेगा, और वापस चालू करने के लिए नया रजिस्ट्रेशन लिंक भेजना होगा.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmRevoke(null)} className="tap rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900">रहने दें</button>
              <button
                onClick={revokeDevice}
                disabled={busyId === confirmRevoke.device.id}
                className="tap rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === confirmRevoke.device.id ? "हट रहा है..." : "हां, अनबाइंड करें"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
