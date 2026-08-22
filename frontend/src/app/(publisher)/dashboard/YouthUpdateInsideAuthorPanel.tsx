"use client";

import { useEffect, useState } from "react";
import { apiFetch, getPublisherId } from "@/lib/api";

const YOUTH_UPDATE_PUBLISHER_ID = "85a50d12-8aa3-4f88-93aa-8153443c1c98";

type InsideAuthor = {
  imageUrl: string;
  editorName: string;
  designation: string;
};

type YouthUpdateInsideAuthorPanelProps = {
  pageNumber?: number;
  onSaved?: () => void;
};

const emptyAuthor = (): InsideAuthor => ({ imageUrl: "", editorName: "", designation: "" });

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsDataURL(file);
  });

export function YouthUpdateInsideAuthorPanel({ pageNumber, onSaved }: YouthUpdateInsideAuthorPanelProps) {
  const [isYouthUpdate, setIsYouthUpdate] = useState(false);
  const [authors, setAuthors] = useState<[InsideAuthor, InsideAuthor, InsideAuthor]>([
    emptyAuthor(),
    emptyAuthor(),
    emptyAuthor(),
  ]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const publisherId = getPublisherId();
    if (publisherId !== YOUTH_UPDATE_PUBLISHER_ID) return;
    setIsYouthUpdate(true);

    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/publisher/youth-update-inside-author/${publisherId}`);
        const data = await res.json().catch(() => null);
        const saved: Array<{ slot_index: number; image_url: string; editor_name: string; designation: string }> =
          data?.authors ?? [];
        const bySlot = new Map(saved.map((author) => [author.slot_index, author]));
        setAuthors(
          [1, 2, 3].map((slotIndex) => {
            const found = bySlot.get(slotIndex);
            return {
              imageUrl: found?.image_url ?? (slotIndex === 1 ? data?.image_url ?? "" : ""),
              editorName: found?.editor_name ?? (slotIndex === 1 ? data?.editor_name ?? "" : ""),
              designation: found?.designation ?? (slotIndex === 1 ? data?.designation ?? "" : ""),
            };
          }) as [InsideAuthor, InsideAuthor, InsideAuthor],
        );
      } catch {
        // Blank until this Youth UPDATE-only panel is saved once.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!isYouthUpdate) return null;

  const updateAuthor = (index: number, patch: Partial<InsideAuthor>) => {
    setAuthors((prev) => {
      const next = [...prev] as [InsideAuthor, InsideAuthor, InsideAuthor];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleImageChange = async (index: number, file: File | null) => {
    if (!file) return;
    updateAuthor(index, { imageUrl: await readFileAsDataUrl(file) });
  };

  const handleSave = async () => {
    const publisherId = getPublisherId();
    if (!publisherId) {
      setMessage("Publisher session missing. Please login again.");
      return;
    }
    if (publisherId !== YOUTH_UPDATE_PUBLISHER_ID) {
      setMessage("This section is only for the Youth UPDATE publisher.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/publisher/youth-update-inside-author", {
        method: "POST",
        body: JSON.stringify({
          publisher_id: publisherId,
          authors: authors.map((author, index) => ({
            slot_index: index + 1,
            image_url: author.imageUrl,
            editor_name: author.editorName.trim(),
            designation: author.designation.trim(),
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "Could not save inside author details.");
        return;
      }
      setMessage(`Saved permanently for Youth UPDATE publisher (${data?.count ?? authors.length} author slots).`);
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save inside author details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">Inside Author Badges (Youth UPDATE)</h2>
      <p className="mt-1 text-sm text-gray-500">
        Three passport image/name/designation slots saved on this publisher ID. Inside pages rotate them by page number.
        {pageNumber ? ` Current setup: page ${pageNumber}.` : ""}
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {authors.map((author, index) => (
            <div key={index} className="rounded-xl border border-gray-200 p-4">
              <span className="text-xs font-semibold uppercase text-gray-400">Author {index + 1}</span>
              <label className="mt-3 flex h-44 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50 text-center text-xs text-gray-400 hover:border-gray-400">
                {author.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={author.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span>Choose passport image</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleImageChange(index, e.target.files?.[0] ?? null)}
                />
              </label>
              <input
                type="text"
                value={author.editorName}
                onChange={(e) => updateAuthor(index, { editorName: e.target.value })}
                placeholder="Editor name"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={author.designation}
                onChange={(e) => updateAuthor(index, { designation: e.target.value })}
                placeholder="Designation"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save inside authors"}
        </button>
        {message ? <span className="text-sm text-gray-600">{message}</span> : null}
      </div>
    </div>
  );
}
