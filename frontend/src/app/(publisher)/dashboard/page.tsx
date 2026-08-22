"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Download, FileText, Newspaper, PenLine, X } from "lucide-react";
import { API_BASE, apiFetch, GENERATOR_URL, getPublisherId, getToken } from "@/lib/api";
import { YouthUpdateMastheadTeasersPanel } from "./YouthUpdateMastheadTeasersPanel";
import { YouthUpdateInsideAuthorPanel } from "./YouthUpdateInsideAuthorPanel";

type GenerateMode = "full" | "single";
type PageSection = { page_number: number; section: string; header_type: string; notes?: string; category?: string };

type BatchPageStatus = "pending" | "ready" | "error";
type BatchPageState = {
  pageNumber: number;
  label: string;
  status: BatchPageStatus;
  thumbnail?: string;
  message?: string;
};

// Youth UPDATE's own publisher id. The two panels below gate on it
// internally as well; this second copy gates the popup itself so no other
// publisher ever gets an empty dialog opening on a page click.
const YOUTH_UPDATE_PUBLISHER_ID = "85a50d12-8aa3-4f88-93aa-8153443c1c98";

const GENERATOR_ORIGIN = (() => {
  try {
    return new URL(GENERATOR_URL).origin;
  } catch {
    return "";
  }
})();

// Per-box manual content — richer than the old single-headline-body-image
// ManualArticle it replaces (subheadline/place/caption, plus author
// portrait+name for an Editorial page's two signed boxes). No box-index
// targeting: the portal has no access to the generator's layout engine
// (templates are only chosen once batch generation actually runs), so these
// just ride the existing manualPinned rank-by-word-count placement the
// generator already has, the same way the old ManualArticle did.
type ManualBoxEntry = {
  id: string;
  page_number: number;
  place: string;
  headline: string;
  subheadline: string;
  body: string;
  image_url: string;
  image_caption: string;
  editor_portrait_url: string;
  editor_name: string;
};

const MANUAL_HEADLINE_MIN_WORDS = 5;
const MANUAL_HEADLINE_MAX_WORDS = 20;

function checkManualHeadlineWordCount(headline: string): string | null {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length < MANUAL_HEADLINE_MIN_WORDS) return `कम से कम ${MANUAL_HEADLINE_MIN_WORDS} शब्द चाहिए (अभी ${words.length}).`;
  if (words.length > MANUAL_HEADLINE_MAX_WORDS) return `${MANUAL_HEADLINE_MAX_WORDS} शब्दों से ज़्यादा न रखें (अभी ${words.length}).`;
  return null;
}

const isEditorialSection = (section?: string) => (section || "").trim().toLowerCase() === "editorial";

const emptyManualBoxEntry = (pageNumber: number): ManualBoxEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  page_number: pageNumber,
  place: "",
  headline: "",
  subheadline: "",
  body: "",
  image_url: "",
  image_caption: "",
  editor_portrait_url: "",
  editor_name: "",
});

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("फाइल पढ़ी नहीं जा सकी."));
    reader.readAsDataURL(file);
  });

function today() {
  // India-only product: the publisher's calendar day must follow IST, not
  // UTC. toISOString() is always UTC, which during 00:00-05:29 IST still
  // reports the previous day -- that's how an edition generated on the 19th
  // got a default issue number/date stamped "...18" (the auto Ank fallback
  // and the publication-date field both called this).
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function getIssueNumber(value: string, date: string) {
  return value.trim() || `Ank ${date || today()}`;
}

function getPageKindLabel(kind: string) {
  if (kind === "front") return "Front page";
  if (kind === "advertisement") return "Advertisement page";
  return "Normal page";
}

// Caps how many individual mini-pages the "पूरा अखबार बनाएं" hero card
// illustrates -- a 24-page edition drawn tile-for-tile would either shrink
// each one unreadably small or blow the card out ("do not stretch much").
// Past the cap, the last tile becomes a "+N और" summary instead of a number.
const MAX_PREVIEW_PAGES = 8;
const PREVIEW_TILE_ROTATIONS = ["-rotate-2", "rotate-1", "rotate-2", "-rotate-1"];

function PagePreviewFan({ pageCount }: { pageCount: number }) {
  const shown = Math.min(Math.max(pageCount, 1), MAX_PREVIEW_PAGES);
  const overflow = pageCount - shown;
  const columns = Math.min(shown, 4);
  const tiles = Array.from({ length: shown }, (_, i) => i + 1);

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {tiles.map((n, i) => {
        const isSummaryTile = i === shown - 1 && overflow > 0;
        return (
          <div
            key={n}
            className={`${PREVIEW_TILE_ROTATIONS[i % PREVIEW_TILE_ROTATIONS.length]} relative h-24 w-[4.5rem] shrink-0 rounded-lg border border-gray-200 bg-white p-1.5 shadow-md shadow-emerald-900/10 transition-transform duration-300 hover:z-10 hover:-translate-y-1 hover:rotate-0`}
          >
            {isSummaryTile ? (
              <div className="flex h-full w-full flex-col items-center justify-center text-emerald-600">
                <span className="text-base font-extrabold leading-none">+{overflow}</span>
                <span className="mt-1 text-center text-[8px] font-semibold leading-tight text-gray-400">और पेज</span>
              </div>
            ) : (
              <>
                <span className="text-xs font-extrabold text-emerald-600">{n}</span>
                <div className="mt-1 h-0.5 w-4 rounded-full bg-emerald-500" />
                <div className="mt-1.5 space-y-1">
                  <div className="h-[3px] w-full rounded-full bg-gray-200" />
                  <div className="h-[3px] w-4/5 rounded-full bg-gray-200" />
                  <div className="h-[3px] w-full rounded-full bg-gray-200" />
                </div>
                <div className="mt-1.5 h-6 w-full rounded bg-gray-100" />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// "पूरा अखबार बनाएं" hero graphic: a small realistic-front-page mockup
// overlapping the page fan's bottom-right corner, matching the reference.
function FrontPageHeroMockup({ newspaperName }: { newspaperName: string }) {
  return (
    <div className="absolute -bottom-4 -right-3 h-28 w-24 rotate-[4deg] rounded-lg border border-emerald-100 bg-white p-2 shadow-xl shadow-emerald-900/15">
      <span className="block truncate text-[9px] font-extrabold tracking-tight text-gray-900">{newspaperName || "दैनिक समाचार"}</span>
      <div className="mt-1 h-[3px] w-full rounded-full bg-emerald-600" />
      <div className="mt-1 h-8 w-full rounded bg-gray-100" />
      <div className="mt-1.5 space-y-1">
        <div className="h-[3px] w-full rounded-full bg-gray-200" />
        <div className="h-[3px] w-4/5 rounded-full bg-gray-200" />
        <div className="h-[3px] w-full rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

// "एक पेज बनाएं" hero graphic: one large PDF document mockup -- a folded
// top-right corner, a PDF tag, a photo placeholder, a few text lines, and a
// download badge overlapping the bottom-right corner.
function PdfDocumentMockup() {
  return (
    <div className="relative h-56 w-48 rounded-2xl bg-white p-5 shadow-2xl shadow-emerald-900/15">
      <div className="absolute right-0 top-0 h-9 w-9 overflow-hidden rounded-tr-2xl">
        <div className="absolute -right-5 -top-5 h-9 w-9 rotate-45 bg-emerald-50" />
      </div>

      <span className="inline-block rounded-md bg-gradient-to-br from-emerald-600 to-teal-600 px-3 py-1.5 text-sm font-extrabold tracking-tight text-white shadow-sm">
        PDF
      </span>

      <div className="mt-4 flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-50">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-400" fill="currentColor">
          <circle cx="7.5" cy="7.5" r="2.3" />
          <path d="M3 18 L9 10 L13 15 L16 11 L21 18 Z" />
        </svg>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-1.5 w-full rounded-full bg-gray-200" />
        <div className="h-1.5 w-full rounded-full bg-gray-200" />
        <div className="h-1.5 w-4/5 rounded-full bg-gray-200" />
        <div className="h-1.5 w-full rounded-full bg-gray-200" />
      </div>

      <div className="animate-badge-glow absolute -bottom-3 -right-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/40 ring-4 ring-white">
        <Download className="h-6 w-6" strokeWidth={2.5} />
      </div>
    </div>
  );
}

export default function PublisherDashboard() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [newspaperName, setNewspaperName] = useState("");
  const [defaultPages, setDefaultPages] = useState(8);
  const [ratePerPage, setRatePerPage] = useState<number>(50);
  const [issueNumber, setIssueNumber] = useState("");
  const [publicationDate, setPublicationDate] = useState(today());
  const [checking, setChecking] = useState<GenerateMode | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [selectedPageNumber, setSelectedPageNumber] = useState(1);
  // The masthead-teaser and inside-author panels used to sit permanently on
  // the dashboard. They now open against the page the publisher just picked:
  // page 1 gets the masthead teasers, any inside page gets the author badges.
  // Filling them stays optional — closing without saving leaves generation to
  // fall back to the live API exactly as before.
  const [isYouthUpdatePublisher, setIsYouthUpdatePublisher] = useState(false);
  const [pageSetupFor, setPageSetupFor] = useState<number | null>(null);
  // Read on mount, not during render: getPublisherId() reads localStorage,
  // which does not exist on the server pass and would mismatch on hydration.
  useEffect(() => {
    setIsYouthUpdatePublisher(getPublisherId() === YOUTH_UPDATE_PUBLISHER_ID);
  }, []);
  const [pageSections, setPageSections] = useState<PageSection[]>([]);
  const [batchActive, setBatchActive] = useState(false);
  const [batchSrc, setBatchSrc] = useState<string | null>(null);
  const [batchPages, setBatchPages] = useState<BatchPageState[]>([]);
  const [batchComplete, setBatchComplete] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ completed: number; total: number } | null>(null);
  const batchIframeRef = useRef<HTMLIFrameElement>(null);
  const [volumeNumber, setVolumeNumber] = useState<number | null>(null);
  // Manual news seeder — reached from "सभी पेज बनायें" now, not its own
  // standing card. showManualPagePicker picks *which* page; manualPageEntries
  // is keyed by page_number and holds that page's list of boxes (each an
  // independent ManualBoxEntry) so switching pages doesn't lose work.
  const [showManualPagePicker, setShowManualPagePicker] = useState(false);
  const [manualSeederPageNumber, setManualSeederPageNumber] = useState<number | null>(null);
  const [manualPageEntries, setManualPageEntries] = useState<Record<number, ManualBoxEntry[]>>({});

  const pageNumbers = useMemo(
    () => Array.from({ length: Math.max(1, defaultPages) }, (_, index) => index + 1),
    [defaultPages],
  );
  const selectedSection = pageSections.find((page) => page.page_number === selectedPageNumber);

  useEffect(() => {
    const publisherId = getPublisherId();
    if (!publisherId) {
      router.replace("/login");
      return;
    }
    apiFetch(`/publisher/wallet/${publisherId}`)
      .then((r) => r.json())
      .then((d) => d?.balance_inr !== undefined && setBalance(Number(d.balance_inr)))
      .catch(() => {});
    apiFetch(`/publisher/profile/${publisherId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.newspaper_name) setNewspaperName(d.newspaper_name);
        if (d?.default_page_count) {
          const pages = parseInt(String(d.default_page_count), 10) || 8;
          setDefaultPages(pages);
          setSelectedPageNumber((current) => Math.min(Math.max(1, current), pages));
        }
        if (Array.isArray(d?.page_sections) && d.page_sections.length) setPageSections(d.page_sections);
        if (d?.last_volume_number !== undefined && d?.last_volume_number !== null) setVolumeNumber(Number(d.last_volume_number));
      })
      .catch(() => {});
    apiFetch("/auth/pricing")
      .then((r) => r.json())
      .then((d) => d?.per_page_cost_inr && setRatePerPage(Number(d.per_page_cost_inr)))
      .catch(() => {});
  }, [router]);

  const choosePageNumber = (pageNumber: number) => {
    setSelectedPageNumber(pageNumber);
    // Youth UPDATE only. Every other publisher's page picker behaves exactly
    // as it did.
    //
    // The picker is closed while the setup popup is up, rather than left
    // open behind it — two dialogs stacked on top of each other left the
    // teaser fields half-covered by the picker's own buttons. It reopens on
    // dismiss (see closePageSetup) so the publisher lands back on the picker
    // with their page still selected and can press "Page N बनाएं".
    if (isYouthUpdatePublisher) {
      setShowPagePicker(false);
      setPageSetupFor(pageNumber);
    }
  };

  const closePageSetup = () => {
    setPageSetupFor(null);
    setShowPagePicker(true);
  };

  const manualEntriesFlat = useMemo(
    () => Object.values(manualPageEntries).flat(),
    [manualPageEntries],
  );

  const openManualSeederForPage = (pageNumber: number) => {
    setShowManualPagePicker(false);
    setManualSeederPageNumber(pageNumber);
    setManualPageEntries((prev) =>
      prev[pageNumber] && prev[pageNumber].length > 0 ? prev : { ...prev, [pageNumber]: [emptyManualBoxEntry(pageNumber)] },
    );
  };

  const updateManualEntry = (pageNumber: number, entryId: string, patch: Partial<ManualBoxEntry>) => {
    setManualPageEntries((prev) => ({
      ...prev,
      [pageNumber]: (prev[pageNumber] || []).map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
    }));
  };

  const addManualBoxForPage = (pageNumber: number) => {
    setManualPageEntries((prev) => ({
      ...prev,
      [pageNumber]: [...(prev[pageNumber] || []), emptyManualBoxEntry(pageNumber)],
    }));
  };

  const removeManualBox = (pageNumber: number, entryId: string) => {
    setManualPageEntries((prev) => ({
      ...prev,
      [pageNumber]: (prev[pageNumber] || []).filter((entry) => entry.id !== entryId),
    }));
  };

  const handleManualEntryImageUpload = async (pageNumber: number, entryId: string, file: File | undefined) => {
    if (!file) return;
    updateManualEntry(pageNumber, entryId, { image_url: await readFileAsDataUrl(file) });
  };

  const handleManualEntryPortraitUpload = async (pageNumber: number, entryId: string, slot: 1 | 2, file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    // Two named portrait fields aren't modeled per-entry in ManualBoxEntry —
    // the editorial UI keeps its own two dedicated entries (see
    // manualPageEntries[pageNumber][0]/[1] for an Editorial page), so slot 1
    // writes the first entry's portrait fields and slot 2 the second's.
    setManualPageEntries((prev) => {
      const entries = [...(prev[pageNumber] || [])];
      const index = slot - 1;
      while (entries.length <= index) entries.push(emptyManualBoxEntry(pageNumber));
      entries[index] = { ...entries[index], editor_portrait_url: dataUrl };
      return { ...prev, [pageNumber]: entries };
    });
  };

  const buildGeneratorParams = (
    mode: GenerateMode | "batch",
    pageCount: number,
    finalIssueNumber = issueNumber,
    pageNumber?: number,
    chargeOnExport = false,
    frontTemplateIndex?: number,
  ) => {
    const publisherId = getPublisherId();
    const section = pageNumber ? pageSections.find((page) => page.page_number === pageNumber) : null;
    const params = new URLSearchParams({
      publisherId: publisherId || "",
      newspaperName,
      pageCount: String(pageCount),
      mode,
      issueNumber: finalIssueNumber,
      publicationDate: publicationDate || today(),
      returnUrl: `${window.location.origin}/dashboard?generated=1`,
      apiBase: API_BASE,
      authToken: getToken() || "",
      pageSections: JSON.stringify(pageSections),
    });
    if (pageNumber) {
      params.set("selectedPageNumber", String(pageNumber));
      params.set("selectedPageName", section?.section || `Page ${pageNumber}`);
      params.set("pageKind", pageNumber === 1 ? "front" : section?.header_type === "advertisement" ? "advertisement" : "normal");
    }
    if (chargeOnExport) {
      params.set("chargeOnExport", "single");
    }
    if (frontTemplateIndex !== undefined) {
      params.set("frontTemplateIndex", String(frontTemplateIndex));
    }
    return params;
  };

  const openGenerator = (
    mode: GenerateMode,
    pageCount: number,
    finalIssueNumber = issueNumber,
    pageNumber?: number,
    chargeOnExport = false,
  ) => {
    const params = buildGeneratorParams(mode, pageCount, finalIssueNumber, pageNumber, chargeOnExport);
    window.location.href = `${GENERATOR_URL}?${params.toString()}`;
  };

  const openSinglePageWithoutDebit = (pageNumber: number) => {
    const finalDate = publicationDate || today();
    const finalIssueNumber = getIssueNumber(issueNumber, finalDate);
    openGenerator("single", 1, finalIssueNumber, pageNumber, true);
  };

  const startBatchGeneration = (pageCount: number, finalIssueNumber: string, frontTemplateIndex?: number) => {
    const params = buildGeneratorParams("batch", pageCount, finalIssueNumber, undefined, false, frontTemplateIndex);
    const initialPages: BatchPageState[] = Array.from({ length: pageCount }, (_, i) => {
      const pageNumber = i + 1;
      const section = pageSections.find((page) => page.page_number === pageNumber);
      return { pageNumber, label: section?.section || `Page ${pageNumber}`, status: "pending" };
    });
    setBatchPages(initialPages);
    setBatchComplete(false);
    setDownloading(false);
    setDownloadProgress(null);
    setBatchSrc(`${GENERATOR_URL}?${params.toString()}`);
    setBatchActive(true);
  };

  const closeBatchPanel = () => {
    setBatchActive(false);
    setBatchSrc(null);
    setBatchPages([]);
    setBatchComplete(false);
    setDownloading(false);
    setDownloadProgress(null);
  };

  const triggerBatchDownload = () => {
    if (!GENERATOR_ORIGIN) return;
    setDownloadProgress({ completed: 0, total: batchPages.length });
    batchIframeRef.current?.contentWindow?.postMessage({ type: "trigger-download" }, GENERATOR_ORIGIN);
    setDownloading(true);
  };

  useEffect(() => {
    if (!batchActive || !GENERATOR_ORIGIN) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== GENERATOR_ORIGIN) return;
      const data = event.data as {
        type?: string;
        pageNumber?: number;
        thumbnail?: string;
        message?: string;
        completed?: number;
        total?: number;
      } | null;
      if (!data || typeof data !== "object") return;

      if (data.type === "page-ready" && typeof data.pageNumber === "number") {
        setBatchPages((prev) =>
          prev.map((page) =>
            page.pageNumber === data.pageNumber
              ? { ...page, status: "ready", thumbnail: data.thumbnail }
              : page,
          ),
        );
      } else if (data.type === "batch-error") {
        if (!data.pageNumber) {
          setDownloading(false);
          setDownloadProgress(null);
          setErrorMsg(data.message || "डाउनलोड में समस्या आई.");
        } else {
          setBatchPages((prev) =>
            prev.map((page) =>
              page.pageNumber === data.pageNumber ? { ...page, status: "error", message: data.message } : page,
            ),
          );
        }
      } else if (data.type === "batch-complete") {
        setBatchComplete(true);
      } else if (data.type === "download-progress" && typeof data.completed === "number" && typeof data.total === "number") {
        setDownloadProgress({ completed: data.completed, total: data.total });
      } else if (data.type === "download-complete") {
        setDownloading(false);
        setDownloadProgress(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [batchActive]);

  const debitFullNewspaperAndOpen = async (publisherId: string) => {
    const finalDate = publicationDate || today();
    const finalIssueNumber = getIssueNumber(issueNumber, finalDate);

    // Save (or clear) this issue's manual box content before spending any
    // wallet balance — a publisher must never be charged for a generation
    // whose manual content failed to save. Only entries with both a headline
    // and body are sent — a box the publisher started but didn't finish is
    // silently dropped, not saved half-filled and mistaken for real content.
    // slot_index counts per page_number, not across the flattened list --
    // manualEntriesFlat mixes every page's boxes into one array, so a plain
    // .map index would give page 5's first box something like slot_index 7
    // just because four other pages' boxes happened to come before it. The
    // backend only ever reads slot_index scoped to one page_number at a time
    // (ORDER BY page_number, slot_index -- see SaaSGetManualBoxContent), so a
    // global index still sorted correctly by coincidence: relative order
    // within a page survives flat() untouched. Counting per page here makes
    // that true by construction instead of by accident.
    const slotIndexByPage: Record<number, number> = {};
    const manualRes = await apiFetch("/publisher/manual-box-content", {
      method: "POST",
      body: JSON.stringify({
        publisher_id: publisherId,
        boxes: manualEntriesFlat
          .filter((entry) => entry.headline.trim() && entry.body.trim())
          .map((entry) => {
            const slotIndex = slotIndexByPage[entry.page_number] ?? 0;
            slotIndexByPage[entry.page_number] = slotIndex + 1;
            return {
              page_number: entry.page_number,
              slot_index: slotIndex,
              headline: entry.headline.trim(),
              subheadline: entry.subheadline.trim(),
              place: entry.place.trim(),
              body: entry.body.trim(),
              image_url: entry.image_url,
              image_caption: entry.image_caption.trim(),
              editor_portrait_url: entry.editor_portrait_url,
              editor_name: entry.editor_name.trim(),
            };
          }),
      }),
    });
    if (!manualRes.ok) {
      setErrorMsg("मैन्युअल न्यूज़ सेव नहीं हो सकी. दोबारा कोशिश करें.");
      return;
    }

    const res = await apiFetch("/publisher/generator/execute", {
      method: "POST",
      body: JSON.stringify({
        publisher_id: publisherId,
        page_count: defaultPages,
        issue_number_ank: finalIssueNumber,
        publication_date: finalDate,
        page_sections: pageSections,
      }),
    });
    const data = await res.json().catch(() => null);

    if (res.status === 402) {
      router.push(`/wallet?insufficient=1&required=${encodeURIComponent(data?.required_amount ?? defaultPages * ratePerPage)}`);
      return;
    }

    if (!res.ok || !data?.success) {
      setErrorMsg(data?.error || "पूरे अखबार का पैसा काटने में समस्या आई.");
      return;
    }

    setBalance(Number(data.remaining_balance));
    if (data.volume_number !== undefined && data.volume_number !== null) setVolumeNumber(Number(data.volume_number));
    startBatchGeneration(defaultPages, finalIssueNumber, Number(data.front_template_index) || 0);
  };

  const handleGenerate = async (mode: GenerateMode, pageCount: number, pageNumber?: number) => {
    const publisherId = getPublisherId();
    if (!publisherId) {
      router.replace("/login");
      return;
    }
    setChecking(mode);
    setErrorMsg(null);
    try {
      if (mode === "single") {
        openSinglePageWithoutDebit(pageNumber ?? selectedPageNumber);
        return;
      }

      await debitFullNewspaperAndOpen(publisherId);
    } catch {
      setErrorMsg("Server से संपर्क नहीं हो पाया.");
    } finally {
      setChecking(null);
      setShowPagePicker(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">डैशबोर्ड</h1>
          <p className="text-sm text-gray-600 mt-1">यहां से wallet check करके generator खोला जाएगा.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right">
          <div>
            <div className="text-xs text-gray-500">बैलेंस</div>
            <div className="text-xl font-bold text-gray-950">{balance !== null ? `₹${balance.toFixed(2)}` : "..."}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">दर</div>
            <div className="text-xl font-bold text-gray-950">₹{ratePerPage}/पेज</div>
          </div>
        </div>
      </div>

      {errorMsg && <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{errorMsg}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">अंक नंबर</label>
          <input value={issueNumber} onChange={(e) => setIssueNumber(e.target.value)} placeholder="जैसे Ank 126" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">प्रकाशन तारीख</label>
          <input type="date" value={publicationDate} onChange={(e) => setPublicationDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          {volumeNumber !== null && (
            <p className="mt-1.5 text-xs text-gray-500">पिछला अंक: Volume {volumeNumber} — अगला अंक बनाने पर यह अपने आप बढ़ेगा।</p>
          )}
        </div>
      </div>

      {isYouthUpdatePublisher && pageSetupFor !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePageSetup();
          }}
        >
          <div className="relative w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-950">
                  {pageSetupFor === 1
                    ? "पेज 1 — मास्टहेड टीज़र"
                    : `पेज ${pageSetupFor} — इनसाइड ऑथर बैज`}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  भरना ज़रूरी नहीं है. खाली छोड़ेंगे तो पेज अपने आप लाइव न्यूज़ से बन जाएगा.
                </p>
              </div>
              <button
                type="button"
                onClick={() => closePageSetup()}
                aria-label="बंद करें"
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Page 1 is the front page and carries the masthead teasers; every
                other page is an inside page and carries the author badges. */}
            {pageSetupFor === 1 ? (
              <YouthUpdateMastheadTeasersPanel />
            ) : (
              <YouthUpdateInsideAuthorPanel pageNumber={pageSetupFor} onSaved={closePageSetup} />
            )}

            <div className="mt-5 flex justify-end gap-3 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => closePageSetup()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                बिना भरे आगे बढ़ें
              </button>
              <button
                type="button"
                onClick={() => closePageSetup()}
                className={`rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 ${pageSetupFor === 1 ? "" : "hidden"}`}
              >
                हो गया
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!batchActive && (
        <div className="flex flex-col gap-5">
          {/* एक पेज बनाएं — a different kind of motion from the "पूरा अखबार"
              card's spinning border below: the card's own background is a
              slow-drifting soft gradient wash (.animate-card-gradient), a
              colour transition living inside the box rather than around
              it. */}
          <div className="group relative overflow-hidden rounded-[28px] border border-emerald-100 p-7 shadow-[0_1px_3px_rgba(5,150,105,0.06)] transition-all duration-300 ease-out hover:shadow-[0_20px_45px_-10px_rgba(5,150,105,0.25)] hover:border-emerald-300">
            <div className="animate-card-gradient pointer-events-none absolute inset-0" />

            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                  <div className="animate-badge-glow absolute inset-0 rounded-2xl bg-emerald-500 blur-md" />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-white/70 transition-transform duration-300 group-hover:scale-105">
                    <FileText className="h-7 w-7" strokeWidth={1.75} />
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-500">एक पेज</div>
                  <h2 className="mt-1.5 text-3xl font-bold tracking-tight text-gray-950">एक पेज बनाएं</h2>
                  <p className="mt-2 text-sm text-gray-500">Profile में set page plan से एक page चुनें — पेज सिर्फ़ PDF export सफल होने पर बनेगा।</p>
                </div>

                <div className="mt-6 border-t border-emerald-200/60 pt-5">
                  <button
                    onClick={() => setShowPagePicker(true)}
                    disabled={checking !== null}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-all duration-300 hover:gap-3 hover:shadow-lg hover:shadow-emerald-500/35 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 disabled:pointer-events-none"
                  >
                    {checking === "single" ? `₹${ratePerPage} काटकर generator खोल रहे हैं...` : "Page चुनें"}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300" />
                  </button>
                </div>
              </div>

              <div className="relative hidden shrink-0 lg:block">
                <PdfDocumentMockup />
              </div>
            </div>
          </div>

          {/* पूरा अखबार बनाएं — spinning ray border (see .animate-border-beam
              in globals.css). Page count, cost text, and the fan
              illustration all come straight from the publisher's own
              profile (defaultPages), never hardcoded. */}
          <div className="relative isolate overflow-hidden rounded-[28px] p-[2px]">
            <div className="animate-border-beam pointer-events-none absolute left-1/2 top-1/2 h-[260%] w-[260%] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0deg,transparent_255deg,#059669_275deg,#10b981_297deg,#34d399_315deg,#0d9488_333deg,transparent_352deg,transparent_360deg)]" />
            <div
              role="button"
              tabIndex={0}
              onClick={() => checking === null && handleGenerate("full", defaultPages)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && checking === null) {
                  e.preventDefault();
                  handleGenerate("full", defaultPages);
                }
              }}
              aria-disabled={checking !== null}
              className={`group relative z-10 overflow-hidden rounded-[26px] bg-gradient-to-br from-white via-white to-emerald-50/70 p-7 text-left transition-all duration-300 ease-out cursor-pointer ${checking !== null ? "opacity-60 pointer-events-none" : ""}`}
            >
              <div className="animate-orb-drift pointer-events-none absolute -top-16 -right-14 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />

              <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                    <div className="animate-badge-glow absolute inset-0 rounded-2xl bg-emerald-500 blur-md" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-white/70 transition-transform duration-300 group-hover:scale-105">
                      <Newspaper className="h-7 w-7" strokeWidth={1.75} />
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-500">पूरा अंक</div>
                    <h2 className="mt-1.5 text-3xl font-bold tracking-tight text-gray-950">पूरा अखबार बनाएं</h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Profile में set page plan से एक पूरा {defaultPages} पेज का अखबार बनाएं — PDF export के साथ।
                    </p>
                  </div>

                  {manualEntriesFlat.length > 0 && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{manualEntriesFlat.length} बॉक्स मैन्युअल रूप से भरे गए ({new Set(manualEntriesFlat.map((e) => e.page_number)).size} पेज पर) — बाकी अपने आप भर जाएंगे।</span>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-emerald-100/70 pt-5">
                    <span className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-all duration-300 group-hover:gap-3 group-hover:shadow-lg group-hover:shadow-emerald-500/35 group-hover:from-emerald-500 group-hover:to-teal-500">
                      {checking === "full" ? "जांच हो रही है..." : "सभी पेज बनाएं"}
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowManualPagePicker(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white/60 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-white"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      मैनुअल न्यूज़ भरें
                    </button>
                  </div>
                </div>

                <div className="relative hidden shrink-0 pb-4 pr-3 lg:block">
                  <div className="pointer-events-none absolute -left-8 top-2 flex flex-col gap-1.5">
                    <span className="block h-4 w-1 -rotate-12 rounded-full bg-emerald-500" />
                    <span className="block h-3 w-1 rotate-6 rounded-full bg-emerald-400" />
                    <span className="block h-4 w-1 -rotate-6 rounded-full bg-emerald-500" />
                  </div>
                  <PagePreviewFan pageCount={defaultPages} />
                  <FrontPageHeroMockup newspaperName={newspaperName} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {batchActive && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          {batchSrc && (
            <iframe
              ref={batchIframeRef}
              src={batchSrc}
              title="Newspaper batch generator"
              style={{ width: 1, height: 1, border: 0, position: "absolute", left: -9999, top: -9999 }}
            />
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-950">पूरा अखबार बन रहा है...</h2>
              <p className="mt-1 text-sm text-gray-600">
                {batchComplete
                  ? "सभी पेज तैयार हैं. अब पूरा PDF डाउनलोड करें."
                  : `${batchPages.filter((p) => p.status !== "pending").length} / ${batchPages.length} पेज तैयार`}
              </p>
              {!batchComplete && (
                <div className="mt-2 h-2 w-full max-w-sm rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-black transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.round((batchPages.filter((p) => p.status !== "pending").length / Math.max(1, batchPages.length)) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <button type="button" onClick={closeBatchPanel} className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-semibold shrink-0">बंद करें</button>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2">
            {(() => {
              // Pages render strictly one at a time, in order (see the
              // generator's batch loop) -- the first still-"pending" page in
              // array order is the one actually being worked on right now;
              // every "pending" page after it is just waiting its turn, not
              // generating in parallel. Previously every pending card showed
              // the same "बन रहा है..." pulse regardless, which looked like
              // all of them were in progress simultaneously.
              const activePageNumber = batchPages.find((p) => p.status === "pending")?.pageNumber;

              return batchPages.map((page) => (
                <div key={page.pageNumber} className="w-40 shrink-0 border border-gray-200 rounded-lg p-2 space-y-2">
                  <div className="text-xs font-bold text-gray-500">पेज {page.pageNumber} · {page.label}</div>
                  <div className="aspect-[3/4] rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                    {page.status === "pending" && page.pageNumber === activePageNumber && (
                      <div className="w-full px-3 space-y-2">
                        <span className="block text-xs text-gray-600 font-medium text-center">बन रहा है...</span>
                        <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-full w-1/3 rounded-full bg-black animate-batch-page-progress" />
                        </div>
                      </div>
                    )}
                    {page.status === "pending" && page.pageNumber !== activePageNumber && (
                      <span className="text-xs text-gray-400">कतार में...</span>
                    )}
                    {page.status === "ready" && page.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={page.thumbnail} alt={`Page ${page.pageNumber} preview`} className="w-full h-full object-contain" />
                    )}
                    {page.status === "error" && <span className="text-xs text-red-600 px-1 text-center">{page.message || "समस्या आई"}</span>}
                  </div>
                </div>
              ));
            })()}
          </div>

          {batchComplete && (
            <div>
              <button
                type="button"
                onClick={triggerBatchDownload}
                disabled={downloading}
                className="px-5 py-2.5 rounded-lg bg-black text-white text-sm font-semibold disabled:opacity-60"
              >
                {downloading
                  ? `PDF तैयार हो रहा है... ${downloadProgress ? `${Math.round((downloadProgress.completed / Math.max(1, downloadProgress.total)) * 100)}%` : ""}`
                  : "सभी पेज डाउनलोड करें (PDF)"}
              </button>
              {downloading && downloadProgress && (
                <div className="mt-2 h-2 w-full max-w-sm rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-black transition-all duration-500 ease-out"
                    style={{ width: `${Math.round((downloadProgress.completed / Math.max(1, downloadProgress.total)) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <Link href="/wallet" className="bg-white border border-gray-200 rounded-xl p-4 text-sm font-semibold hover:border-gray-400">वॉलेट और रिचार्ज</Link>
        <Link href="/history" className="bg-white border border-gray-200 rounded-xl p-4 text-sm font-semibold hover:border-gray-400">पुराने अंक</Link>
        <Link href="/profile" className="bg-white border border-gray-200 rounded-xl p-4 text-sm font-semibold hover:border-gray-400">प्रोफाइल सेटिंग</Link>
      </div>

      {showPagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-950">कौन सा पेज बनाना है?</h2>
                <p className="mt-1 text-sm text-gray-600">Profile में {defaultPages} pages हैं. एक पेज बनाने पर wallet से ₹{ratePerPage.toFixed(2)} कटेंगे.</p>
              </div>
              <button type="button" onClick={() => setShowPagePicker(false)} className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-semibold">बंद</button>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold text-gray-600">Page number</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {pageNumbers.map((pageNumber) => {
                  const section = pageSections.find((page) => page.page_number === pageNumber);
                  const kind = pageNumber === 1 ? "front" : section?.header_type || "inside";
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => choosePageNumber(pageNumber)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm font-semibold ${selectedPageNumber === pageNumber ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-900 hover:border-gray-400"}`}
                    >
                      <span className="block">Page {pageNumber}</span>
                      <span className={`mt-1 block text-xs ${selectedPageNumber === pageNumber ? "text-gray-200" : "text-gray-500"}`}>{section?.section || getPageKindLabel(kind)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold text-gray-600">Selected page</div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800">
                Page {selectedPageNumber} · {selectedSection?.section || "Normal page"} · {getPageKindLabel(selectedPageNumber === 1 ? "front" : selectedSection?.header_type || "inside")}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowPagePicker(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={() => handleGenerate("single", 1, selectedPageNumber)} disabled={checking !== null} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {checking === "single" ? "Generator खोल रहे हैं..." : `Page ${selectedPageNumber} बनाएं`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual news seeder — step 1: pick which page (same page-grid pattern
          as the single-page picker above, different purpose: this one opens
          the per-box seeder for that page rather than generating it alone). */}
      {showManualPagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 backdrop-blur-sm px-4">
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25">
                    <PenLine className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-950">किस पेज के लिए मैनुअल न्यूज़ भरनी है?</h2>
                    <p className="mt-1 text-sm text-gray-500">जो पेज नहीं चुनेंगे, वहाँ खबरें अपने आप API से भर जाएंगी।</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManualPagePicker(false)}
                  aria-label="बंद करें"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {pageNumbers.map((pageNumber) => {
                  const section = pageSections.find((page) => page.page_number === pageNumber);
                  const kind = pageNumber === 1 ? "front" : section?.header_type || "inside";
                  const isEditorial = isEditorialSection(section?.section);
                  const boxCount = (manualPageEntries[pageNumber] || []).filter((e) => e.headline.trim() && e.body.trim()).length;
                  const accent = pageNumber === 1
                    ? { Icon: Newspaper, hover: "hover:border-indigo-300 hover:bg-indigo-50/50", badge: "text-indigo-600 bg-indigo-50" }
                    : isEditorial
                      ? { Icon: PenLine, hover: "hover:border-amber-300 hover:bg-amber-50/50", badge: "text-amber-600 bg-amber-50" }
                      : { Icon: FileText, hover: "hover:border-gray-300 hover:bg-gray-50", badge: "text-gray-600 bg-gray-100" };
                  const { Icon } = accent;
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => openManualSeederForPage(pageNumber)}
                      className={`group relative rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition-all duration-200 ${accent.hover} hover:-translate-y-0.5 hover:shadow-md`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent.badge}`}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </div>
                      <span className="mt-2 block text-sm font-bold text-gray-900">Page {pageNumber}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {section?.section || getPageKindLabel(kind)}
                        {isEditorial && " · संपादकीय"}
                      </span>
                      {boxCount > 0 && (
                        <span className="absolute top-2 right-2 inline-flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold w-5 h-5 ring-2 ring-white">{boxCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual news seeder — step 2: per-box content for the chosen page.
          Editorial pages (page_sections.section === "Editorial") additionally
          get two author portrait+name fields, matching the generator's own
          Editorial tab (EditorialSlotPanel) which already has this exact
          author-rail concept for अभिव्यक्ति's two signed boxes. */}
      {manualSeederPageNumber !== null && (() => {
        const pageNumber = manualSeederPageNumber;
        const section = pageSections.find((page) => page.page_number === pageNumber);
        const isEditorial = isEditorialSection(section?.section);
        const entries = manualPageEntries[pageNumber] || [];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
            <div className="w-full max-w-2xl max-h-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-950">
                    Page {pageNumber} · {section?.section || getPageKindLabel(pageNumber === 1 ? "front" : "inside")}
                    {isEditorial && " (संपादकीय)"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">हेडलाइन और टेक्स्ट भरना ज़रूरी है — बाकी सब वैकल्पिक। खाली छोड़ने पर बॉक्स अपने आप भर जाएगा।</p>
                </div>
                <button type="button" onClick={() => setManualSeederPageNumber(null)} className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-semibold shrink-0">बंद</button>
              </div>

              {isEditorial && (
                <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-bold text-gray-900">लेखक की तस्वीर और नाम (दो जगह)</h3>
                  <p className="mt-1 text-xs text-gray-600">संपादकीय पेज पर दो जगह लेखक की फ़ोटो और नाम छपते हैं — नीचे भरें।</p>
                  <div className="mt-3 grid sm:grid-cols-2 gap-4">
                    {[1, 2].map((slot) => {
                      const entry = entries[slot - 1];
                      return (
                        <div key={slot} className="rounded-lg border border-amber-200 bg-white p-3 space-y-2">
                          <div className="text-xs font-semibold text-gray-600">लेखक {slot}</div>
                          <label className="border border-dashed border-gray-300 rounded-lg px-3 py-2 text-xs flex items-center justify-between cursor-pointer">
                            <span className="truncate">{entry?.editor_portrait_url ? "फ़ोटो चुनी गई" : "पोर्ट्रेट फ़ोटो चुनें"}</span>
                            <span className="text-xs font-semibold text-gray-600 shrink-0 ml-2">फाइल</span>
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => void handleManualEntryPortraitUpload(pageNumber, entry?.id || "", slot as 1 | 2, e.target.files?.[0])}
                            />
                          </label>
                          <input
                            value={entry?.editor_name || ""}
                            onChange={(e) => {
                              if (!entry) {
                                addManualBoxForPage(pageNumber);
                                return;
                              }
                              updateManualEntry(pageNumber, entry.id, { editor_name: e.target.value });
                            }}
                            placeholder="लेखक का नाम"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-5 space-y-4">
                {entries.map((entry, index) => {
                  const wordWarning = checkManualHeadlineWordCount(entry.headline);
                  return (
                    <div key={entry.id} className="rounded-lg border border-gray-200 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-500">बॉक्स {index + 1}</span>
                        <button type="button" onClick={() => removeManualBox(pageNumber, entry.id)} className="text-red-600 text-xs font-semibold">हटाएं</button>
                      </div>
                      <input
                        value={entry.place}
                        onChange={(e) => updateManualEntry(pageNumber, entry.id, { place: e.target.value })}
                        placeholder="स्थान (वैकल्पिक)"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      <div>
                        <textarea
                          value={entry.headline}
                          onChange={(e) => updateManualEntry(pageNumber, entry.id, { headline: e.target.value })}
                          placeholder="हेडलाइन * (5 से 20 शब्द)"
                          rows={2}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                        {wordWarning && <p className="mt-1 text-xs text-red-600 font-semibold">{wordWarning}</p>}
                      </div>
                      <textarea
                        value={entry.subheadline}
                        onChange={(e) => updateManualEntry(pageNumber, entry.id, { subheadline: e.target.value })}
                        placeholder="सब-हेडलाइन (वैकल्पिक)"
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      <textarea
                        value={entry.body}
                        onChange={(e) => updateManualEntry(pageNumber, entry.id, { body: e.target.value })}
                        placeholder="आर्टिकल टेक्स्ट *"
                        rows={4}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        <label className="border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm flex items-center justify-between cursor-pointer">
                          <span className="truncate">{entry.image_url ? "फ़ोटो चुनी गई" : "फोटो चुनें (वैकल्पिक)"}</span>
                          <span className="text-xs font-semibold text-gray-600 shrink-0 ml-2">फाइल चुनें</span>
                          <input type="file" accept="image/*" hidden onChange={(e) => void handleManualEntryImageUpload(pageNumber, entry.id, e.target.files?.[0])} />
                        </label>
                        <input
                          value={entry.image_caption}
                          onChange={(e) => updateManualEntry(pageNumber, entry.id, { image_caption: e.target.value })}
                          placeholder="फोटो कैप्शन (वैकल्पिक)"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => addManualBoxForPage(pageNumber)} className="rounded-lg border border-dashed border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-600">
                  + और बॉक्स जोड़ें
                </button>
                <button type="button" onClick={() => setManualSeederPageNumber(null)} className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white">
                  हो गया
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
