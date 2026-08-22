"use client";

import React, { useEffect, useState } from "react";
import { apiFetch, getPublisherId } from "@/lib/api";

type PageSection = { page_number: number; section: string; header_type: string; notes: string; category: string };

// Must be byte-identical to NEWSWIRE_CATEGORIES in the generator
// (src/lib/newswire.ts) — the generator reads page_sections[].category
// straight through with no translation layer (see the `category` cast in
// EditorCanvas.tsx's batch loop), so a value here that doesn't exist on
// that side is silently rejected by the generator's /api/newswire route
// and the page falls back to guessing a category from the section name
// instead. Previously drifted ("Madhyapradesh" vs "Madhya Pradesh",
// "National/State" vs "National", plus "Science"/"Technology" which don't
// exist on the generator side at all) — every category a publisher picked
// through this dropdown was silently ignored as a result.
const NEWSWIRE_CATEGORIES = [
  "National",
  "Madhya Pradesh",
  "International",
  "Sports",
  "Business",
  "Health",
  "Entertainment",
];

const defaultSections = (count: number): PageSection[] =>
  Array.from({ length: count }, (_, i) => ({
    page_number: i + 1,
    section: i === 0 ? "मुख्य पेज" : "सामान्य खबरें",
    header_type: i === 0 ? "front" : "inside",
    notes: "",
    category: i === 0 ? "National" : "Madhya Pradesh",
  }));

const YOUTH_UPDATE_PUBLISHER_ID = "85a50d12-8aa3-4f88-93aa-8153443c1c98";

/**
 * Youth UPDATE's own page plan, so their pages arrive named instead of every
 * inside page reading "सामान्य खबरें".
 *
 * The section NAME is not just a label: the generator routes an editorial
 * page off it (a page called "Editorial" composes with the editorial house
 * style rather than the news one), and the category drives which newswire
 * feed fills the page. Page 1 stays the front page and the last page is the
 * editorial, matching how the paper is actually made up.
 *
 * Only the starting point — the plan stays fully editable in the form below,
 * and a publisher who has already saved one keeps it untouched.
 */
const YOUTH_UPDATE_SECTION_PLAN: { section: string; category: string }[] = [
  { section: "Front Page", category: "National" },
  { section: "Madhya Pradesh", category: "Madhya Pradesh" },
  { section: "Business", category: "Business" },
  { section: "National", category: "National" },
  { section: "International", category: "International" },
  { section: "Sports", category: "Sports" },
  { section: "Entertainment", category: "Entertainment" },
  { section: "Editorial", category: "National" },
];

const youthUpdateSections = (count: number): PageSection[] =>
  Array.from({ length: count }, (_, i) => {
    const planned = YOUTH_UPDATE_SECTION_PLAN[i];
    const fallback = defaultSections(count)[i];
    // Past the end of the plan (a longer edition) the generic default still
    // applies, so a bigger page count never produces unnamed blanks.
    if (!planned) return fallback;
    return {
      page_number: i + 1,
      section: planned.section,
      header_type: i === 0 ? "front" : "inside",
      notes: "",
      category: planned.category,
    };
  });

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("फाइल पढ़ी नहीं जा सकी."));
    reader.readAsDataURL(file);
  });

export default function PublisherProfilePage() {
  const [publisherName, setPublisherName] = useState("");
  const [newspaperName, setNewspaperName] = useState("");
  const [pubType, setPubType] = useState("Daily");
  const [defaultPages, setDefaultPages] = useState("8");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [city, setCity] = useState("");
  const [coverPrice, setCoverPrice] = useState("");
  const [startYear, setStartYear] = useState("");
  // One-time baseline for volume auto-increment — see wizard/page.tsx for the
  // same fields. SaaSExecuteGeneration only advances last_volume_number once
  // this has been set at least once (either here or in the wizard).
  const [lastVolumeNumber, setLastVolumeNumber] = useState("");
  const [lastPublishedDate, setLastPublishedDate] = useState("");
  const [frontHeaderUrl, setFrontHeaderUrl] = useState("");
  const [remainingHeaderUrl, setRemainingHeaderUrl] = useState("");
  const [frontHeaderName, setFrontHeaderName] = useState("");
  const [insideHeaderName, setInsideHeaderName] = useState("");
  const [pageSections, setPageSections] = useState<PageSection[]>(defaultSections(8));
  const [pagePlanLocked, setPagePlanLocked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const publisherId = getPublisherId();
    if (!publisherId) return;
    apiFetch(`/publisher/profile/${publisherId}`).then((r) => r.json()).then((d) => {
      if (!d) return;
      setPublisherName(d.publisher_name || "");
      setNewspaperName(d.newspaper_name || "");
      setPubType(d.publication_type || "Daily");
      setDefaultPages(String(d.default_page_count || "8"));
      setEmail(d.email || "");
      setMobile(d.mobile || "");
      setCity(d.city || "");
      setCoverPrice(d.cover_price || "");
      setStartYear(d.publication_start_year ? String(d.publication_start_year) : "");
      setLastVolumeNumber(d.last_volume_number !== undefined && d.last_volume_number !== null ? String(d.last_volume_number) : "");
      setLastPublishedDate(d.last_published_date ? String(d.last_published_date).slice(0, 10) : "");
      setFrontHeaderUrl(d.front_page_header_url || "");
      setRemainingHeaderUrl(d.remaining_page_header_url || "");
      if (Array.isArray(d.page_sections) && d.page_sections.length) {
        setPageSections(
          d.page_sections.map((p: PageSection) => ({
            ...p,
            category: NEWSWIRE_CATEGORIES.includes(p.category)
              ? p.category
              : p.page_number === 1 ? "National" : "Madhya Pradesh",
          })),
        );
      } else if (publisherId === YOUTH_UPDATE_PUBLISHER_ID) {
        // Nothing saved yet: seed this publisher's own named plan rather than
        // leaving every inside page as "सामान्य खबरें". Only ever the initial
        // value — a saved plan is taken as-is by the branch above, so this can
        // never overwrite names the publisher has already chosen.
        setPageSections(youthUpdateSections(Number(d.default_page_count) || 8));
      }
      setPagePlanLocked(Boolean(d.is_setup_completed));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (pagePlanLocked) return;
    const count = parseInt(defaultPages, 10) || 8;
    setPageSections((prev) => Array.from({ length: count }, (_, i) => prev.find((p) => p.page_number === i + 1) || defaultSections(count)[i]));
  }, [defaultPages, pagePlanLocked]);

  const handleHeaderUpload = async (file: File | undefined, target: "front" | "inside") => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    if (target === "front") {
      setFrontHeaderUrl(dataUrl);
      setFrontHeaderName(file.name);
    } else {
      setRemainingHeaderUrl(dataUrl);
      setInsideHeaderName(file.name);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const publisherId = getPublisherId();
    if (!publisherId) {
      setToast("Session नहीं मिला. कृपया दोबारा login करें.");
      return;
    }
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
          default_page_count: defaultPages,
          city,
          state: "",
          mobile,
          email,
          front_page_header_url: frontHeaderUrl,
          remaining_page_header_url: remainingHeaderUrl,
          cover_price: coverPrice,
          publication_start_year: parseInt(startYear, 10) || 0,
          last_volume_number: lastVolumeNumber.trim() ? parseInt(lastVolumeNumber, 10) : null,
          last_published_date: lastPublishedDate,
          page_sections: pageSections,
        }),
      });
      const data = await res.json().catch(() => null);
      setToast(res.ok ? "प्रोफाइल सेव हो गई." : data?.error || "प्रोफाइल सेव नहीं हो सकी.");
      if (res.ok) setPagePlanLocked(true);
    } catch {
      setToast("API से संपर्क नहीं हो पाया.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">प्रोफाइल</h1>
        <p className="text-sm text-gray-600 mt-1">अखबार की जानकारी और generator page plan यहां set होता है.</p>
      </div>
      {toast && <div className="p-4 rounded-lg bg-gray-100 border border-gray-200 text-sm font-medium">{toast}</div>}
      {pagePlanLocked && <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-sm font-medium text-yellow-900">Page count और page plan अब lock है. बदलाव के लिए admin से contact करें.</div>}

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-gray-950">अखबार की जानकारी</h2>
          <input value={publisherName} onChange={(e) => setPublisherName(e.target.value)} placeholder="पब्लिशर / संपादक का नाम" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={newspaperName} onChange={(e) => setNewspaperName(e.target.value)} placeholder="अखबार का नाम" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <div className="grid sm:grid-cols-2 gap-3">
            <select value={pubType} onChange={(e) => setPubType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="Daily">दैनिक</option>
              <option value="Weekly">साप्ताहिक</option>
            </select>
            <select value={defaultPages} disabled={pagePlanLocked} onChange={(e) => setDefaultPages(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100">
              <option value="6">6 पेज</option>
              <option value="8">8 पेज</option>
              <option value="12">12 पेज</option>
              <option value="24">24 पेज</option>
            </select>
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ईमेल" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="मोबाइल" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </section>

        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-gray-950">मास्टहेड</h2>
          <p className="text-xs text-gray-500 -mt-2">शहर, अंक मूल्य और आरंभ वर्ष हर अंक पर हेडर इमेज के ऊपर अपने आप छप जाते हैं — तारीख और दिन की तरह.</p>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="शहर (जैसे Bhopal)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={coverPrice} onChange={(e) => setCoverPrice(e.target.value)} placeholder="अंक मूल्य (जैसे Rs. 5)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input
              value={startYear}
              onChange={(e) => setStartYear(e.target.value.replace(/\D/g, ""))}
              placeholder="प्रकाशन आरंभ वर्ष"
              inputMode="numeric"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">वॉल्यूम नंबर — एक बार भरें, आगे अपने आप बढ़ेगा</p>
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
          </div>
          <label className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm flex items-center justify-between cursor-pointer">
            <span>फ्रंट पेज हेडर इमेज {frontHeaderName ? `— ${frontHeaderName}` : frontHeaderUrl ? "— अपलोड की गई" : ""}</span>
            <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">फाइल चुनें</span>
            <input type="file" accept="image/*" hidden onChange={(e) => void handleHeaderUpload(e.target.files?.[0], "front")} />
          </label>
          <label className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm flex items-center justify-between cursor-pointer">
            <span>इनसाइड पेज हेडर इमेज {insideHeaderName ? `— ${insideHeaderName}` : remainingHeaderUrl ? "— अपलोड की गई" : ""}</span>
            <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">फाइल चुनें</span>
            <input type="file" accept="image/*" hidden onChange={(e) => void handleHeaderUpload(e.target.files?.[0], "inside")} />
          </label>
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="font-bold text-gray-950">पेज प्लान</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {pageSections.map((page) => (
            <div key={page.page_number} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-gray-500">पेज {page.page_number}</div>
              <input disabled={pagePlanLocked} value={page.section} onChange={(e) => setPageSections((rows) => rows.map((p) => p.page_number === page.page_number ? { ...p, section: e.target.value } : p))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-100" />
              <select disabled={pagePlanLocked || page.page_number === 1} value={page.page_number === 1 ? "front" : page.header_type} onChange={(e) => setPageSections((rows) => rows.map((p) => p.page_number === page.page_number ? { ...p, header_type: e.target.value } : p))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:bg-gray-100">
                <option value="front">Front page</option>
                <option value="inside">Normal page</option>
                <option value="advertisement">Advertisement page</option>
              </select>
              <select disabled={pagePlanLocked} value={NEWSWIRE_CATEGORIES.includes(page.category) ? page.category : (page.page_number === 1 ? "National" : "Madhya Pradesh")} onChange={(e) => setPageSections((rows) => rows.map((p) => p.page_number === page.page_number ? { ...p, category: e.target.value } : p))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:bg-gray-100">
                {NEWSWIRE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input disabled={pagePlanLocked} value={page.notes} onChange={(e) => setPageSections((rows) => rows.map((p) => p.page_number === page.page_number ? { ...p, notes: e.target.value } : p))} placeholder="नोट" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:bg-gray-100" />
            </div>
          ))}
        </div>
      </section>

      <button disabled={saving} className="px-5 py-2.5 rounded-lg bg-black text-white text-sm font-semibold disabled:opacity-50">{saving ? "सेव हो रहा है..." : "प्रोफाइल सेव करें"}</button>
    </form>
  );
}
