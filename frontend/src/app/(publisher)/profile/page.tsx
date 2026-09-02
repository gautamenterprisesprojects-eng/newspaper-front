"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { apiFetch, clearSession, getPublisherId } from "@/lib/api";

type EditorialAuthor = { name: string; image_url: string; imageName?: string };

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("फाइल पढ़ी नहीं जा सकी."));
    reader.readAsDataURL(file);
  });

const emptyEditorialAuthor = (): EditorialAuthor => ({ name: "", image_url: "" });

const cleanEditorialAuthors = (authors: EditorialAuthor[]) =>
  authors
    .map((author) => ({
      name: author.name.trim(),
      image_url: author.image_url.trim(),
    }))
    .filter((author) => author.name || author.image_url);

export default function PublisherProfilePage() {
  const router = useRouter();
  const [publisherName, setPublisherName] = useState("");
  const [newspaperName, setNewspaperName] = useState("");
  const [pubType, setPubType] = useState("Daily");
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
  const [editorialAuthors, setEditorialAuthors] = useState<EditorialAuthor[]>([emptyEditorialAuthor()]);
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
      setEmail(d.email || "");
      setMobile(d.mobile || "");
      setCity(d.city || "");
      setCoverPrice(d.cover_price || "");
      setStartYear(d.publication_start_year ? String(d.publication_start_year) : "");
      setLastVolumeNumber(d.last_volume_number !== undefined && d.last_volume_number !== null ? String(d.last_volume_number) : "");
      setLastPublishedDate(d.last_published_date ? String(d.last_published_date).slice(0, 10) : "");
      const savedAuthors = Array.isArray(d.editorial_authors)
        ? d.editorial_authors
            .map((author: { name?: string; image_url?: string }) => ({
              name: String(author?.name || ""),
              image_url: String(author?.image_url || ""),
            }))
            .filter((author: EditorialAuthor) => author.name || author.image_url)
        : [];
      if (savedAuthors.length > 0) {
        setEditorialAuthors(savedAuthors);
      } else if (d.editorial_author_name || d.editorial_author_image_url) {
        setEditorialAuthors([
          {
            name: d.editorial_author_name || "",
            image_url: d.editorial_author_image_url || "",
          },
        ]);
      }
    }).catch(() => {});
  }, []);

  const updateEditorialAuthor = (index: number, patch: Partial<EditorialAuthor>) => {
    setEditorialAuthors((current) =>
      current.map((author, authorIndex) => authorIndex === index ? { ...author, ...patch } : author),
    );
  };

  const handleEditorialAuthorImageUpload = async (index: number, file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateEditorialAuthor(index, { image_url: dataUrl, imageName: file.name });
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
      const cleanedAuthors = cleanEditorialAuthors(editorialAuthors);
      const primaryAuthor = cleanedAuthors[0] ?? { name: "", image_url: "" };
      const res = await apiFetch("/publisher/wizard-complete", {
        method: "POST",
        body: JSON.stringify({
          publisher_id: publisherId,
          publisher_name: publisherName,
          newspaper_name: newspaperName,
          publication_type: pubType,
          number_of_editions: 1,
          city,
          state: "",
          mobile,
          email,
          editorial_author_name: primaryAuthor.name,
          editorial_author_image_url: primaryAuthor.image_url,
          editorial_authors: cleanedAuthors,
          cover_price: coverPrice,
          publication_start_year: parseInt(startYear, 10) || 0,
          last_volume_number: lastVolumeNumber.trim() ? parseInt(lastVolumeNumber, 10) : null,
          last_published_date: lastPublishedDate,
        }),
      });
      const data = await res.json().catch(() => null);
      setToast(res.ok ? "प्रोफाइल सेव हो गई." : data?.error || "प्रोफाइल सेव नहीं हो सकी.");
    } catch {
      setToast("API से संपर्क नहीं हो पाया.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <h1 className="page-title text-2xl font-bold">प्रोफाइल</h1>
        <p className="text-sm text-gray-600 mt-1">अखबार की जानकारी, मास्टहेड और editorial authors यहां set होते हैं.</p>
      </div>
      {toast && <div className="p-4 rounded-lg bg-gray-100 border border-gray-200 text-sm font-medium">{toast}</div>}

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="min-w-0 surface-card p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-bold text-gray-950">Editorial authors</h2>
              <p className="text-xs text-gray-500 mt-1">Editorial page banate waqt in saved authors me se author choose hoga.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditorialAuthors((current) => [...current, emptyEditorialAuthor()])}
              className="tap min-h-[40px] shrink-0 rounded-lg border border-gray-300 px-3.5 text-xs font-bold text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:px-3 sm:py-2"
            >
              Add author
            </button>
          </div>

          <div className="space-y-4">
            {editorialAuthors.map((author, index) => (
              <div key={index} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Author {index + 1}</span>
                  {editorialAuthors.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setEditorialAuthors((current) => current.filter((_, authorIndex) => authorIndex !== index))}
                      className="text-xs font-semibold text-red-600"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  value={author.name}
                  onChange={(e) => updateEditorialAuthor(index, { name: e.target.value })}
                  placeholder="Author / editor name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
                <div className="flex gap-4 items-start">
                  <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {author.image_url ? (
                      <img src={author.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-gray-400">No photo</div>
                    )}
                  </div>
                  {/* min-w-0: a flex child defaults to min-width:auto, so the
                      non-wrapping filename below would hold this column open
                      past the card and push the page into horizontal scroll. */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="tap-row flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm">
                      <span className="min-w-0 truncate">{author.imageName ? author.imageName : author.image_url ? "Photo uploaded" : "Upload author photo"}</span>
                      <span className="shrink-0 text-xs font-semibold text-gray-600 whitespace-nowrap">Choose</span>
                      <input type="file" accept="image/*" hidden onChange={(e) => void handleEditorialAuthorImageUpload(index, e.target.files?.[0])} />
                    </label>
                    {author.image_url ? (
                      <button
                        type="button"
                        onClick={() => updateEditorialAuthor(index, { image_url: "", imageName: "" })}
                        className="text-xs font-semibold text-red-600"
                      >
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 surface-card p-4 sm:p-6 space-y-4">
          <h2 className="font-bold text-gray-950">अखबार की जानकारी</h2>
          <input value={publisherName} onChange={(e) => setPublisherName(e.target.value)} placeholder="पब्लिशर / संपादक का नाम" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={newspaperName} onChange={(e) => setNewspaperName(e.target.value)} placeholder="अखबार का नाम" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <div className="grid sm:grid-cols-2 gap-3">
            <select value={pubType} onChange={(e) => setPubType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="Daily">दैनिक</option>
              <option value="Weekly">साप्ताहिक</option>
            </select>
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ईमेल" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="मोबाइल" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </section>

        <section className="min-w-0 surface-card p-4 sm:p-6 space-y-4">
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
          <p className="text-xs text-gray-500">एडिशन हेडर, थीम कलर और पेज प्लान अब <a href="/settings" className="font-semibold text-gray-800 underline">सेटिंग्स</a> में एक बार सेट होते हैं.</p>
        </section>
      </div>

      <button disabled={saving} className="tap btn-brand rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50 sm:rounded-lg sm:py-2.5">{saving ? "सेव हो रहा है..." : "प्रोफाइल सेव करें"}</button>

      {/* Account actions. The desktop sidebar carries these, but it is hidden
          on phones -- which left the setup wizard and, more importantly, log
          out with no route to them at all on mobile. Profile is where people
          look for account controls, so they live here below lg. */}
      <section className="surface-card divide-y divide-gray-100 lg:hidden">
        <Link
          href="/wizard"
          className="tap-row flex items-center justify-between gap-3 px-4 py-4 text-sm font-semibold text-gray-800"
        >
          सेटअप विज़ार्ड
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        </Link>
        <button
          type="button"
          onClick={() => {
            clearSession();
            router.push("/login");
          }}
          className="tap-row flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-semibold text-red-600"
        >
          लॉग आउट
          <LogOut className="h-4 w-4 shrink-0" />
        </button>
      </section>
    </form>
  );
}
