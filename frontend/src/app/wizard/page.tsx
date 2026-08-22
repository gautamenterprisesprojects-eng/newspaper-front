"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getPublisherId } from "@/lib/api";

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("फाइल पढ़ी नहीं जा सकी."));
    reader.readAsDataURL(file);
  });

export default function WizardPage() {
  const router = useRouter();
  const [publisherName, setPublisherName] = useState("");
  const [newspaperName, setNewspaperName] = useState("");
  const [pubType, setPubType] = useState("Daily");
  const [pages, setPages] = useState("8");
  const [city, setCity] = useState("");
  const [coverPrice, setCoverPrice] = useState("");
  const [startYear, setStartYear] = useState("");
  // One-time baseline for volume auto-increment — "my last edition was
  // Volume N, dated D." Every "generate all pages" afterwards advances N by
  // however many days (Daily) or weeks (Weekly) have actually passed since D.
  const [lastVolumeNumber, setLastVolumeNumber] = useState("");
  const [lastPublishedDate, setLastPublishedDate] = useState("");
  const [frontHeader, setFrontHeader] = useState("");
  const [insideHeader, setInsideHeader] = useState("");
  const [frontHeaderName, setFrontHeaderName] = useState("");
  const [insideHeaderName, setInsideHeaderName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleHeaderUpload = async (file: File | undefined, target: "front" | "inside") => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    if (target === "front") {
      setFrontHeader(dataUrl);
      setFrontHeaderName(file.name);
    } else {
      setInsideHeader(dataUrl);
      setInsideHeaderName(file.name);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const publisherId = getPublisherId();
    if (!publisherId) {
      setMessage("Session नहीं मिला. कृपया दोबारा लॉगिन करें.");
      return;
    }
    const pageCount = parseInt(pages, 10) || 8;
    setSaving(true);
    try {
      const res = await apiFetch("/publisher/wizard-complete", {
        method: "POST",
        body: JSON.stringify({
          publisher_id: publisherId,
          publisher_name: publisherName,
          newspaper_name: newspaperName,
          publication_type: pubType,
          number_of_editions: 1,
          default_page_count: String(pageCount),
          city,
          state: "",
          mobile: "",
          email: "",
          front_page_header_url: frontHeader,
          remaining_page_header_url: insideHeader,
          cover_price: coverPrice,
          publication_start_year: parseInt(startYear, 10) || 0,
          last_volume_number: lastVolumeNumber.trim() ? parseInt(lastVolumeNumber, 10) : null,
          last_published_date: lastPublishedDate,
          page_sections: Array.from({ length: pageCount }, (_, i) => ({
            page_number: i + 1,
            section: i === 0 ? "मुख्य पेज" : "सामान्य खबरें",
            header_type: i === 0 ? "front" : "inside",
            notes: "",
            category: i === 0 ? "National" : "Madhya Pradesh",
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) router.push("/dashboard");
      else setMessage(data?.error || "सेटअप सेव नहीं हो सका.");
    } catch {
      setMessage("API से संपर्क नहीं हो पाया.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <form onSubmit={save} className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-6 sm:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">पहला सेटअप</h1>
          <p className="text-sm text-gray-600 mt-1">यह जानकारी बाद में प्रोफाइल page से बदली जा सकती है.</p>
        </div>
        {message && <div className="p-4 rounded-lg bg-gray-100 border border-gray-200 text-sm">{message}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <input required value={publisherName} onChange={(e) => setPublisherName(e.target.value)} placeholder="पब्लिशर / संपादक का नाम" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input required value={newspaperName} onChange={(e) => setNewspaperName(e.target.value)} placeholder="अखबार का नाम" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <select value={pubType} onChange={(e) => setPubType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="Daily">दैनिक</option>
            <option value="Weekly">साप्ताहिक</option>
          </select>
          <select value={pages} onChange={(e) => setPages(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="6">6 पेज</option>
            <option value="8">8 पेज</option>
            <option value="12">12 पेज</option>
            <option value="24">24 पेज</option>
          </select>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="शहर (मास्टहेड पर छपेगा)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={coverPrice} onChange={(e) => setCoverPrice(e.target.value)} placeholder="अंक मूल्य (जैसे Rs. 5)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input
            value={startYear}
            onChange={(e) => setStartYear(e.target.value.replace(/\D/g, ""))}
            placeholder="प्रकाशन आरंभ वर्ष (जैसे 2018)"
            inputMode="numeric"
            className="sm:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">वॉल्यूम नंबर (वैकल्पिक) — एक बार भरें, आगे अपने आप बढ़ेगा</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                value={lastVolumeNumber}
                onChange={(e) => setLastVolumeNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="पिछला वॉल्यूम नंबर (जैसे 67)"
                inputMode="numeric"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
              <input
                type="date"
                value={lastPublishedDate}
                onChange={(e) => setLastPublishedDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">यह वॉल्यूम नंबर जिस तारीख का था, वो तारीख डालें — अगली बार अंक बनाने पर सही अंतर से नंबर बढ़ेगा।</p>
          </div>
          <label className="sm:col-span-2 border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm flex items-center justify-between cursor-pointer">
            <span>फ्रंट पेज हेडर इमेज {frontHeaderName ? `— ${frontHeaderName}` : ""}</span>
            <span className="text-xs font-semibold text-gray-600">फाइल चुनें</span>
            <input type="file" accept="image/*" hidden onChange={(e) => void handleHeaderUpload(e.target.files?.[0], "front")} />
          </label>
          <label className="sm:col-span-2 border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm flex items-center justify-between cursor-pointer">
            <span>इनसाइड पेज हेडर इमेज {insideHeaderName ? `— ${insideHeaderName}` : ""}</span>
            <span className="text-xs font-semibold text-gray-600">फाइल चुनें</span>
            <input type="file" accept="image/*" hidden onChange={(e) => void handleHeaderUpload(e.target.files?.[0], "inside")} />
          </label>
        </div>
        <button disabled={saving} className="px-5 py-2.5 rounded-lg bg-black text-white text-sm font-semibold disabled:opacity-50">{saving ? "सेव हो रहा है..." : "सेटअप पूरा करें"}</button>
      </form>
    </div>
  );
}
