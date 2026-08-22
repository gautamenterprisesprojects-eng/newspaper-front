"use client";

/**
 * Youth UPDATE's own four front-page masthead teaser slots. The generator
 * already renders whatever is saved here in the exact masthead positions, so
 * this panel only prepares the daily image/headline data for that one
 * publisher id.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getPublisherId } from "@/lib/api";

const YOUTH_UPDATE_PUBLISHER_ID = "85a50d12-8aa3-4f88-93aa-8153443c1c98";
const API_CATEGORIES = ["Entertainment", "Sports"] as const;
const SLOT_PAGE_HINTS = [7, 4, 7, 8] as const;

type TeaserSlot = {
  headline: string;
  categoryLabel: string;
  imageUrl: string;
};

type ApiArticle = {
  id: string;
  category: string;
  headline: string;
  imageUrl: string;
  place?: string;
};

type NewswirePayload = {
  data?: Array<{
    id?: string | number;
    category?: string;
    headline?: string;
    imageUrl?: string;
    image_url?: string;
    place?: string;
  }>;
  error?: string;
};

const emptySlot = (): TeaserSlot => ({ headline: "", categoryLabel: "", imageUrl: "" });

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsDataURL(file);
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Image could not be converted."));
    reader.readAsDataURL(blob);
  });

const createTeaserImageDataUrl = async (imageUrl: string) => {
  if (imageUrl.startsWith("data:")) return imageUrl;

  const source = imageUrl.startsWith("data:")
    ? imageUrl
    : `/api/youth-update-masthead-image?url=${encodeURIComponent(imageUrl)}`;
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error("Image could not be fetched.");
  return blobToDataUrl(await response.blob());
};

const fetchArticlesByCategory = async (category: (typeof API_CATEGORIES)[number]) => {
  const response = await fetch(
    `/api/youth-update-masthead-news?category=${encodeURIComponent(category)}&language=hindi&limit=8`,
    { cache: "no-store" },
  );
  const payload = (await response.json().catch(() => null)) as NewswirePayload | null;
  if (!response.ok) throw new Error(payload?.error || `Could not fetch ${category} news.`);

  return (payload?.data ?? [])
    .map((item, index): ApiArticle => ({
      id: String(item.id ?? `${category}-${index}`),
      category: item.category || category,
      headline: String(item.headline || "").trim(),
      imageUrl: String(item.imageUrl || item.image_url || "").trim(),
      place: item.place,
    }))
    .filter((item) => item.headline && item.imageUrl);
};

const categoryLabelForArticle = (article: ApiArticle, slotIndex: number) => {
  const category = article.category.toLowerCase().includes("sport") ? "SPORTS POST" : "ENTERTAINMENT";
  return `${category}-P${SLOT_PAGE_HINTS[slotIndex]}`;
};

export function YouthUpdateMastheadTeasersPanel() {
  const [isYouthUpdate, setIsYouthUpdate] = useState(false);
  const [slots, setSlots] = useState<[TeaserSlot, TeaserSlot, TeaserSlot, TeaserSlot]>([
    emptySlot(),
    emptySlot(),
    emptySlot(),
    emptySlot(),
  ]);
  const [articles, setArticles] = useState<ApiArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingArticles, setFetchingArticles] = useState(false);
  const [processingSlot, setProcessingSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const groupedArticles = useMemo(
    () => ({
      Entertainment: articles.filter((article) => article.category.toLowerCase().includes("entertainment")),
      Sports: articles.filter((article) => article.category.toLowerCase().includes("sport")),
    }),
    [articles],
  );

  useEffect(() => {
    const publisherId = getPublisherId();
    if (publisherId !== YOUTH_UPDATE_PUBLISHER_ID) return;
    setIsYouthUpdate(true);

    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/publisher/masthead-teasers/${publisherId}`);
        const data = await res.json().catch(() => null);
        const saved: Array<{ slot_index: number; headline: string; category_label: string; image_url: string }> =
          data?.teasers ?? [];
        const bySlot = new Map(saved.map((t) => [t.slot_index, t]));
        setSlots(
          [1, 2, 3, 4].map((slotIndex) => {
            const found = bySlot.get(slotIndex);
            return {
              headline: found?.headline ?? "",
              categoryLabel: found?.category_label ?? "",
              imageUrl: found?.image_url ?? "",
            };
          }) as [TeaserSlot, TeaserSlot, TeaserSlot, TeaserSlot],
        );
      } catch {
        // Keep the editor usable even if no saved teaser rows exist yet.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!isYouthUpdate) return null;

  const updateSlot = (index: number, patch: Partial<TeaserSlot>) => {
    setSlots((prev) => {
      const next = [...prev] as [TeaserSlot, TeaserSlot, TeaserSlot, TeaserSlot];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleImageChange = async (index: number, file: File | null) => {
    if (!file) return;
    updateSlot(index, { imageUrl: await readFileAsDataUrl(file) });
  };

  const handleFetchArticles = async () => {
    setFetchingArticles(true);
    setMessage(null);
    try {
      const [entertainment, sports] = await Promise.all([
        fetchArticlesByCategory("Entertainment"),
        fetchArticlesByCategory("Sports"),
      ]);
      setArticles([...entertainment, ...sports]);
      setMessage(`Loaded ${entertainment.length + sports.length} Sports/Entertainment stories.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load masthead news.");
    } finally {
      setFetchingArticles(false);
    }
  };

  const applyArticleToSlot = async (article: ApiArticle, index: number) => {
    setProcessingSlot(index);
    setMessage(null);
    try {
      const imageUrl = await createTeaserImageDataUrl(article.imageUrl);
      updateSlot(index, {
        headline: article.headline,
        categoryLabel: categoryLabelForArticle(article, index),
        imageUrl,
      });
      setMessage(`Slot ${index + 1} updated from ${article.category}.`);
    } catch (error) {
      updateSlot(index, {
        headline: article.headline,
        categoryLabel: categoryLabelForArticle(article, index),
        imageUrl: article.imageUrl,
      });
      setMessage(
        error instanceof Error
          ? `Slot ${index + 1} updated, but background removal failed: ${error.message}`
          : `Slot ${index + 1} updated, but background removal failed.`,
      );
    } finally {
      setProcessingSlot(null);
    }
  };

  const handleAutoFill = async () => {
    const picked = [
      groupedArticles.Entertainment[0],
      groupedArticles.Entertainment[1],
      groupedArticles.Sports[0],
      groupedArticles.Sports[1],
    ].filter(Boolean) as ApiArticle[];

    if (picked.length < 4) {
      setMessage("Load at least 2 Entertainment and 2 Sports stories first.");
      return;
    }

    for (let index = 0; index < 4; index += 1) {
      await applyArticleToSlot(picked[index], index);
    }
  };

  const handleSave = async () => {
    const publisherId = getPublisherId();
    if (!publisherId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/publisher/masthead-teasers", {
        method: "POST",
        body: JSON.stringify({
          publisher_id: publisherId,
          teasers: slots.map((slot, i) => ({
            slot_index: i + 1,
            headline: slot.headline.trim(),
            category_label: slot.categoryLabel.trim(),
            image_url: slot.imageUrl,
          })),
        }),
      });
      setMessage(res.ok ? "Masthead teasers saved." : "Could not save masthead teasers.");
    } catch {
      setMessage("Could not save masthead teasers.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Masthead Teasers (Youth UPDATE)</h2>
      <p className="mt-1 text-sm text-gray-500">
        Four front header items: transparent image, headline, and category label. Saved content appears directly in the
        Youth UPDATE generator header.
      </p>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Sports / Entertainment API News</h3>
            <p className="mt-1 text-xs text-gray-600">Select a story for any header slot, or fill all four at once.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFetchArticles}
              disabled={fetchingArticles || processingSlot !== null}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:border-blue-400 disabled:opacity-50"
            >
              {fetchingArticles ? "Loading..." : "Load API news"}
            </button>
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={articles.length === 0 || processingSlot !== null}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Auto-fill 4 slots
            </button>
          </div>
        </div>

        {articles.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {articles.slice(0, 10).map((article) => (
              <div key={`${article.category}-${article.id}`} className="rounded-lg border border-blue-100 bg-white p-3">
                <div className="flex gap-3">
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/youth-update-masthead-image?url=${encodeURIComponent(article.imageUrl)}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase text-blue-600">{article.category}</div>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-gray-900">{article.headline}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[0, 1, 2, 3].map((slotIndex) => (
                        <button
                          key={slotIndex}
                          type="button"
                          onClick={() => void applyArticleToSlot(article, slotIndex)}
                          disabled={processingSlot !== null}
                          className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
                        >
                          Slot {slotIndex + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {slots.map((slot, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-4">
              <span className="text-xs font-semibold uppercase text-gray-400">Slot {i + 1}</span>

              <label className="mt-2 flex h-24 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400 hover:border-gray-400">
                {slot.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slot.imageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span>Select image</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleImageChange(i, e.target.files?.[0] ?? null)}
                />
              </label>

              <input
                type="text"
                value={slot.headline}
                onChange={(e) => updateSlot(i, { headline: e.target.value })}
                placeholder="Headline"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={slot.categoryLabel}
                onChange={(e) => updateSlot(i, { categoryLabel: e.target.value })}
                placeholder="Category label"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {processingSlot === i ? <p className="mt-2 text-xs font-semibold text-blue-600">Preparing image...</p> : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || processingSlot !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save teasers"}
        </button>
        {message ? <span className="text-sm text-gray-600">{message}</span> : null}
      </div>
    </div>
  );
}
