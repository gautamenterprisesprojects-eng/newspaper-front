"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getPublisherId } from "@/lib/api";
import { isTourEnabled, setTourEnabled, startTour } from "@/components/tour/tourSteps";

type PageSection = { page_number: number; section: string; header_type: string; notes: string; categories: string[] };
type Edition = { name: string; front_header_url: string; inside_header_url: string; frontHeaderName?: string; insideHeaderName?: string };

// Must be byte-identical to NEWSWIRE_CATEGORIES in the generator
// (src/lib/newswire.ts) — the generator reads page_sections[].categories
// straight through with no translation layer, so a value here that doesn't
// exist on that side is silently rejected by the generator's /api/newswire
// route and the page falls back to guessing a category from the section
// name instead. See profile/page.tsx history for the drift this caused
// before ("Madhyapradesh" vs "Madhya Pradesh", etc.).
const NEWSWIRE_CATEGORIES = [
  "National",
  "Madhya Pradesh",
  "International",
  "Sports",
  "Business",
  "Health",
  "Entertainment",
];

const DEFAULT_THEME_COLOR = "#0f6f83"; // matches the generator's own accentColor default

// Must match isEditorialSection in dashboard/page.tsx exactly — that's the
// rule the generator itself uses (via getGeneratorPageKind) to route a page
// to the editorial content system (राशिफल + desk copy) instead of the
// newswire category pipeline, so a page named "Editorial" already gets
// treated as editorial there even without the header_type dropdown below
// being switched. Category selection is meaningless for either signal.
const isEditorialSectionName = (name: string) => name.trim().toLowerCase() === "editorial";

const defaultSections = (count: number): PageSection[] =>
  Array.from({ length: count }, (_, i) => ({
    page_number: i + 1,
    section: i === 0 ? "मुख्य पेज" : "सामान्य खबरें",
    header_type: i === 0 ? "front" : "inside",
    notes: "",
    categories: [i === 0 ? "National" : "Madhya Pradesh"],
  }));

const YOUTH_UPDATE_PUBLISHER_ID = "85a50d12-8aa3-4f88-93aa-8153443c1c98";

/**
 * Youth UPDATE's own page plan, so their pages arrive named instead of every
 * inside page reading "सामान्य खबरें". Only ever the initial value for a
 * publisher who has never saved a page plan — see profile/page.tsx's prior
 * history of this same seed, moved here now that the page plan itself moved
 * from Profile to Settings.
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
    if (!planned) return fallback;
    return {
      page_number: i + 1,
      section: planned.section,
      header_type: i === 0 ? "front" : "inside",
      notes: "",
      categories: [planned.category],
    };
  });

const emptyEdition = (): Edition => ({ name: "", front_header_url: "", inside_header_url: "" });

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("फाइल पढ़ी नहीं जा सकी."));
    reader.readAsDataURL(file);
  });

export default function PublisherSettingsPage() {
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);
  const [editions, setEditions] = useState<Edition[]>([emptyEdition()]);
  const [pageCount, setPageCount] = useState(8);
  const [pageSections, setPageSections] = useState<PageSection[]>(defaultSections(8));
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const [tourOn, setTourOn] = useState(true);

  // localStorage is client-only; read after mount to avoid a hydration split.
  useEffect(() => setTourOn(isTourEnabled()), []);

  useEffect(() => {
    const publisherId = getPublisherId();
    if (!publisherId) return;
    apiFetch(`/publisher/profile/${publisherId}`).then((r) => r.json()).then((d) => {
      if (!d) return;
      setThemeColor(d.theme_color || DEFAULT_THEME_COLOR);

      const savedEditions: Edition[] = Array.isArray(d.editions)
        ? d.editions.map((e: { name?: string; front_header_url?: string; inside_header_url?: string }) => ({
            name: String(e?.name || ""),
            front_header_url: String(e?.front_header_url || ""),
            inside_header_url: String(e?.inside_header_url || ""),
          }))
        : [];
      if (savedEditions.length > 0) {
        setEditions(savedEditions);
      } else if (d.front_page_header_url || d.remaining_page_header_url) {
        // Legacy single-header publisher who saved headers on Profile before
        // this feature existed: carry those into edition 1 so they aren't
        // asked to re-upload artwork they already have on file.
        setEditions([{ name: "मुख्य एडिशन", front_header_url: d.front_page_header_url || "", inside_header_url: d.remaining_page_header_url || "" }]);
      }

      const savedSections: PageSection[] = Array.isArray(d.page_sections) ? d.page_sections : [];
      if (savedSections.length > 0) {
        setPageCount(savedSections.length);
        setPageSections(
          savedSections.map((p) => ({
            page_number: p.page_number,
            section: p.section,
            header_type: p.header_type,
            notes: p.notes || "",
            categories: Array.isArray(p.categories) && p.categories.length ? p.categories.filter((c) => NEWSWIRE_CATEGORIES.includes(c)) : [p.page_number === 1 ? "National" : "Madhya Pradesh"],
          })),
        );
      } else if (publisherId === YOUTH_UPDATE_PUBLISHER_ID) {
        setPageSections(youthUpdateSections(8));
      }

      setLocked(Boolean(d.settings_locked));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (locked || !loaded) return;
    setPageSections((prev) => Array.from({ length: pageCount }, (_, i) => prev.find((p) => p.page_number === i + 1) || defaultSections(pageCount)[i]));
  }, [pageCount, locked, loaded]);

  const updateEdition = (index: number, patch: Partial<Edition>) => {
    setEditions((current) => current.map((ed, i) => (i === index ? { ...ed, ...patch } : ed)));
  };

  const handleEditionHeaderUpload = async (index: number, target: "front" | "inside", file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    if (target === "front") updateEdition(index, { front_header_url: dataUrl, frontHeaderName: file.name });
    else updateEdition(index, { inside_header_url: dataUrl, insideHeaderName: file.name });
  };

  const setEditionCount = (count: number) => {
    const n = Math.max(1, count);
    setEditions((current) => Array.from({ length: n }, (_, i) => current[i] || emptyEdition()));
  };

  const toggleCategory = (pageNumber: number, category: string) => {
    setPageSections((rows) =>
      rows.map((p) => {
        if (p.page_number !== pageNumber) return p;
        const has = p.categories.includes(category);
        if (has && p.categories.length === 1) return p; // at least one category required
        return { ...p, categories: has ? p.categories.filter((c) => c !== category) : [...p.categories, category] };
      }),
    );
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
      const res = await apiFetch("/publisher/settings", {
        method: "POST",
        body: JSON.stringify({
          publisher_id: publisherId,
          theme_color: themeColor,
          editions: editions
            .map((ed) => ({ name: ed.name.trim(), front_header_url: ed.front_header_url, inside_header_url: ed.inside_header_url }))
            .filter((ed) => ed.name || ed.front_header_url || ed.inside_header_url),
          page_sections: pageSections.map((p) => ({ ...p, category: p.categories[0] || "" })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setLocked(true);
        setToast("सेटिंग्स सेव और lock हो गईं.");
      } else {
        setToast(data?.error || "सेटिंग्स सेव नहीं हो सकीं.");
        if (res.status === 403) setLocked(true);
      }
    } catch {
      setToast("API से संपर्क नहीं हो पाया.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <div className="text-sm text-gray-500">लोड हो रहा है...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-2xl font-bold">सेटिंग्स</h1>
        <p className="text-sm text-gray-600 mt-1">एडिशन हेडर, थीम कलर और पेज प्लान — एक बार सेव करने पर lock हो जाता है, बदलाव के लिए admin से unlock करवाएं.</p>
      </div>
      {toast && <div className="p-4 rounded-lg bg-gray-100 border border-gray-200 text-sm font-medium">{toast}</div>}
      {locked && <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-sm font-medium text-yellow-900">सेटिंग्स lock हैं. बदलाव के लिए admin से contact करें — वो unlock कर देंगे, फिर आप दोबारा सेव कर सकते हैं.</div>}

      {/* Outside the form on purpose: this is a device preference, not part
          of the publisher record, and it must stay usable while settings are
          locked. */}
      <section className="surface-card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="font-bold text-gray-950">ट्यूटोरियल</h2>
          <p className="mt-1 text-xs text-gray-500">
            डैशबोर्ड पर स्टेप-बाय-स्टेप गाइड दिखाएं। कभी भी दोबारा चला सकते हैं।
          </p>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
          <button
            type="button"
            onClick={() => {
              router.push("/dashboard");
              // Let the dashboard mount before the tour looks for its targets.
              window.setTimeout(() => startTour(), 700);
            }}
            className="tap rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700"
          >
            अभी देखें
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={tourOn}
            aria-label="ट्यूटोरियल चालू या बंद करें"
            onClick={() => {
              const next = !tourOn;
              setTourOn(next);
              setTourEnabled(next);
            }}
            className={`switch ${tourOn ? "is-on" : ""}`}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </section>

      <form onSubmit={save} className="space-y-6">
        <section className="surface-card p-6 space-y-4">
          <h2 className="font-bold text-gray-950">थीम कलर</h2>
          <p className="text-xs text-gray-500 -mt-2">आपके पेज header accent के लिए default रंग — जनरेटर में हर पेज इसी रंग से शुरू होगा.</p>
          <div className="flex items-center gap-3">
            <input type="color" disabled={locked} value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="h-10 w-16 rounded border border-gray-300 disabled:opacity-60" />
            <span className="text-sm font-mono text-gray-700">{themeColor}</span>
          </div>
        </section>

        <section className="surface-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-gray-950">एडिशन</h2>
              <p className="text-xs text-gray-500 mt-1">आपके कितने edition हैं (जैसे Bhopal, Jabalpur)? हर एक का अपना front/inside header होगा.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              संख्या
              <input
                type="number"
                min={1}
                disabled={locked}
                value={editions.length}
                onChange={(e) => setEditionCount(parseInt(e.target.value, 10) || 1)}
                className="w-20 min-h-[40px] rounded-lg border border-gray-300 px-3 py-2 text-base disabled:bg-gray-100 sm:w-16 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-sm"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {editions.map((ed, index) => (
              <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">एडिशन {index + 1}</span>
                <input
                  disabled={locked}
                  value={ed.name}
                  onChange={(e) => updateEdition(index, { name: e.target.value })}
                  placeholder="एडिशन का नाम (जैसे Bhopal Edition)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
                />
                <label className="w-full border border-dashed border-gray-300 bg-white rounded-lg px-3 py-2.5 text-xs flex items-center justify-between cursor-pointer disabled:bg-gray-100">
                  <span className="truncate">फ्रंट हेडर {ed.frontHeaderName ? `— ${ed.frontHeaderName}` : ed.front_header_url ? "— अपलोड की गई" : ""}</span>
                  <span className="font-semibold text-gray-600 whitespace-nowrap ml-2">चुनें</span>
                  <input type="file" accept="image/*" hidden disabled={locked} onChange={(e) => void handleEditionHeaderUpload(index, "front", e.target.files?.[0])} />
                </label>
                <label className="w-full border border-dashed border-gray-300 bg-white rounded-lg px-3 py-2.5 text-xs flex items-center justify-between cursor-pointer">
                  <span className="truncate">इनसाइड हेडर {ed.insideHeaderName ? `— ${ed.insideHeaderName}` : ed.inside_header_url ? "— अपलोड की गई" : ""}</span>
                  <span className="font-semibold text-gray-600 whitespace-nowrap ml-2">चुनें</span>
                  <input type="file" accept="image/*" hidden disabled={locked} onChange={(e) => void handleEditionHeaderUpload(index, "inside", e.target.files?.[0])} />
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-bold text-gray-950">पेज प्लान</h2>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              पेज count
              <select disabled={locked} value={pageCount} onChange={(e) => setPageCount(parseInt(e.target.value, 10))} className="min-h-[40px] rounded-lg border border-gray-300 px-3 py-2 text-base disabled:bg-gray-100 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-sm">
                <option value={6}>6</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
                <option value={16}>16</option>
                <option value={24}>24</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-gray-500 -mt-2">हर पेज का नाम आप खुद रखें, और एक से ज़्यादा category भी चुन सकते हैं — जनरेटर उन सब categories की खबरें mix करेगा.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pageSections.map((page) => (
              <div key={page.page_number} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-bold text-gray-500">पेज {page.page_number}</div>
                <input
                  disabled={locked}
                  value={page.section}
                  onChange={(e) => setPageSections((rows) => rows.map((p) => (p.page_number === page.page_number ? { ...p, section: e.target.value } : p)))}
                  placeholder="पेज का नाम"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base disabled:bg-gray-100 sm:px-2 sm:py-1.5 sm:text-sm"
                />
                <select
                  disabled={locked || page.page_number === 1}
                  value={page.page_number === 1 ? "front" : page.header_type}
                  onChange={(e) => setPageSections((rows) => rows.map((p) => (p.page_number === page.page_number ? { ...p, header_type: e.target.value } : p)))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base disabled:bg-gray-100 sm:px-2 sm:py-1.5 sm:text-xs"
                >
                  <option value="front">Front page</option>
                  <option value="inside">Normal page</option>
                  <option value="editorial">Editorial page</option>
                  <option value="advertisement">Advertisement page</option>
                </select>
                {page.page_number === 1 || page.header_type === "editorial" || isEditorialSectionName(page.section) ? (
                  <p className="text-[11px] text-gray-500 italic">
                    {page.page_number === 1
                      ? "फ्रंट पेज खुद-ब-खुद कई categories की मिली-जुली खबरों से बनता है — यहां category चुनने की ज़रूरत नहीं."
                      : "एडिटोरियल पेज की अपनी अलग content व्यवस्था है (राशिफल + डेस्क कॉपी) — category यहां लागू नहीं होती."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {NEWSWIRE_CATEGORIES.map((c) => {
                      const checked = page.categories.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          disabled={locked}
                          onClick={() => toggleCategory(page.page_number, c)}
                          className={`tap min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 sm:text-[11px] ${checked ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-300"}`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input
                  disabled={locked}
                  value={page.notes}
                  onChange={(e) => setPageSections((rows) => rows.map((p) => (p.page_number === page.page_number ? { ...p, notes: e.target.value } : p)))}
                  placeholder="नोट"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base disabled:bg-gray-100 sm:px-2 sm:py-1.5 sm:text-xs"
                />
              </div>
            ))}
          </div>
        </section>

        {/* This form runs many screens long on a phone; pinning the save
            action keeps it reachable without scrolling back down. It sits
            above the tab bar, hence the bottom offset. */}
        {!locked && (
          <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-30 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <button
              disabled={saving}
              className="tap w-full btn-brand rounded-xl py-3.5 text-base font-semibold disabled:opacity-50 lg:w-auto lg:px-6 lg:py-2.5 lg:text-sm"
            >
              {saving ? "सेव हो रहा है..." : "सेटिंग्स सेव और lock करें"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
