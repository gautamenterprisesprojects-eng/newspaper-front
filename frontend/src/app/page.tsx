"use client";

import React, { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function LandingPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    owner_name: "",
    newspaper_name: "",
    mobile: "",
    email: "",
    city: "",
    state: "",
    publication_type: "Daily",
    rni_number: "",
    message: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await apiFetch("/auth/request-access", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          aadhar_doc: "r2-cdn://verification/aadhar/local-demo.pdf",
          rni_doc: "r2-cdn://verification/rni/local-demo.pdf",
          b_form_doc: "r2-cdn://verification/bform/local-demo.pdf",
        }),
      });
      const data = await res.json().catch(() => null);
      setStatus(res.ok && data?.success ? "आपका आवेदन जमा हो गया है. एडमिन जांच के बाद लॉगिन देगा." : data?.error || "आवेदन जमा नहीं हो सका.");
    } catch {
      setStatus("API से संपर्क नहीं हो पाया. कृपया server चालू होने पर दोबारा कोशिश करें.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
        <div className="space-y-6">
          <span className="inline-flex px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700">
            न्यूज़पेपर जनरेटर मैनेजमेंट पोर्टल
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-950">
            अपने अखबार, वॉलेट और जनरेटर को एक जगह से मैनेज करें
          </h1>
          <p className="text-base text-gray-600 leading-7 max-w-2xl">
            पब्लिशर आवेदन, एडमिन approval, wallet recharge, प्रति पेज लागत और `D:\newspaper_generater` editor तक साफ handoff. यह portal generator को manage करने के लिए बनाया गया है.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => setOpen(true)} className="px-5 py-3 rounded-lg bg-black text-white text-sm font-semibold hover:bg-gray-800">
              पब्लिशर access मांगें
            </button>
            <Link href="/login" className="px-5 py-3 rounded-lg bg-white border border-gray-300 text-sm font-semibold text-gray-800 hover:bg-gray-50 text-center">
              लॉगिन करें
            </Link>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          {[
            ["प्रति पेज दर", "₹50", "एडमिन बदल सकता है"],
            ["जनरेटर", "D:\\newspaper_generater", "local editor app"],
            ["भुगतान", "वॉलेट", "रिचार्ज के बाद generation"],
            ["सुरक्षा", "Admin approval", "public signup बंद"],
          ].map(([label, value, sub]) => (
            <div key={label} className="flex items-center justify-between border-b border-gray-100 last:border-0 pb-4 last:pb-0">
              <div>
                <div className="text-sm font-semibold text-gray-900">{label}</div>
                <div className="text-xs text-gray-500">{sub}</div>
              </div>
              <div className="text-lg font-bold text-gray-950">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="grid md:grid-cols-4 gap-4">
        {["आवेदन जमा करें", "एडमिन approve करे", "वॉलेट recharge करें", "जनरेटर खोलें"].map((title, i) => (
          <div key={title} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-400">चरण {i + 1}</div>
            <h3 className="mt-2 font-bold text-gray-950">{title}</h3>
            <p className="mt-2 text-sm text-gray-600">सरल workflow ताकि publisher रोज का अंक जल्दी बना सके.</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-950">सरल दर</h2>
        <p className="mt-1 text-sm text-gray-600">अभी default ₹50 प्रति पेज है. 8 पेज का अंक ₹400 में बनेगा.</p>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-950">पब्लिशर आवेदन</h2>
                <p className="text-xs text-gray-500">जानकारी भरें, एडमिन approval देगा.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-black">बंद</button>
            </div>
            {status && <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">{status}</div>}
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ["owner_name", "मालिक / संपादक का नाम"],
                ["newspaper_name", "अखबार का नाम"],
                ["mobile", "मोबाइल नंबर"],
                ["email", "ईमेल"],
                ["city", "शहर"],
                ["state", "राज्य"],
                ["rni_number", "RNI नंबर"],
              ].map(([key, label]) => (
                <input
                  key={key}
                  required={["owner_name", "newspaper_name", "mobile"].includes(key)}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={label}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              ))}
              <select value={form.publication_type} onChange={(e) => setForm((f) => ({ ...f, publication_type: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="Daily">दैनिक</option>
                <option value="Weekly">साप्ताहिक</option>
              </select>
            </div>
            <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="कोई अतिरिक्त जानकारी" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold">रद्द करें</button>
              <button disabled={loading} className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold disabled:opacity-50">{loading ? "जमा हो रहा है..." : "आवेदन भेजें"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
