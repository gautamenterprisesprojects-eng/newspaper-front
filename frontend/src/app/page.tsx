"use client";

import React, { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const FEATURES: Array<{ title: string; desc: string; icon: React.ReactNode }> = [
  {
    title: "स्वचालित पेज लेआउट",
    desc: "फ्रंट व इनसाइड पेज के लिए 6 व 8-कॉलम सहित दर्जनों पेशेवर टेम्पलेट — हर स्टोरी की लंबाई के हिसाब से खुद फिट होते हैं।",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="18" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  },
  {
    title: "हर संस्करण की ताज़ा खबरें",
    desc: "राष्ट्रीय, राज्य और स्थानीय खबरें अपने आप अपडेट होती रहती हैं — हर संस्करण उस दिन के ताज़ा कंटेंट के साथ छपता है।",
    icon: (
      <>
        <path d="M4 12a8 8 0 0 1 8-8" />
        <path d="M4 12a8 8 0 0 0 8 8" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22" />
      </>
    ),
  },
  {
    title: "आपका अपना मास्टहेड",
    desc: "आपके अपलोड किए मास्टहेड पर दिन, तारीख़, अंक संख्या और मूल्य हर बार अपने आप जुड़ते हैं — कोई मैन्युअल एडिटिंग नहीं।",
    icon: (
      <>
        <path d="M4 6h16M4 6v13a1 1 0 0 0 1 1h9M4 6l3-3h9l3 3M14 20l3-3M14 20v-4h4" />
      </>
    ),
  },
  {
    title: "हिंदी व अंग्रेज़ी, दोनों में",
    desc: "द्विभाषी टाइपोग्राफ़ी इंजन हेडलाइन, बॉडी और कैप्शन को दोनों भाषाओं में सही फिट और संतुलन के साथ सेट करता है।",
    icon: (
      <>
        <path d="M5 8h14M5 8a3 3 0 1 1 0-6h9a3 3 0 1 1 0 6M5 8v9a3 3 0 0 0 3 3h9.5" />
        <path d="M14 16l3 3 5-6" />
      </>
    ),
  },
  {
    title: "राशिफल, संपादकीय व विशेष पेज",
    desc: "पंचांग-शैली राशिफल ग्रिड, हस्ताक्षरित संपादकीय स्तंभ और विशेष पेज अपने आप बनते और सज जाते हैं।",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 15 0 0 1 0 18a9 15 0 0 1 0-18Z" />
        <path d="M3 12h18" />
      </>
    ),
  },
  {
    title: "प्रिंट-रेडी PDF",
    desc: "पूरा अंक एक क्लिक में हाई-रेज़ॉल्यूशन PDF में एक्सपोर्ट होता है — सीधे प्रेस भेजने के लिए तैयार।",
    icon: (
      <>
        <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </>
    ),
  },
];

const WORKFLOW_STEPS = [
  {
    title: "आवेदन जमा करें",
    desc: "अपने अखबार, RNI और संपर्क का विवरण भरकर एक्सेस के लिए आवेदन करें।",
  },
  {
    title: "एडमिन स्वीकृति",
    desc: "हमारी टीम दस्तावेज़ जांचकर आपके लिए पब्लिशर एक्सेस खोलती है।",
  },
  {
    title: "वॉलेट रीचार्ज",
    desc: "प्रति-पेज आधार पर वॉलेट भरें — कोई मासिक शुल्क या लॉक-इन नहीं।",
  },
  {
    title: "अपना अंक बनाएं",
    desc: "जनरेटर खोलें और कुछ ही मिनटों में आज का पूरा अंक तैयार करें।",
  },
];

const TICKER_ITEMS = [
  { tag: "राष्ट्रीय", text: "हर घंटे ताज़ा कंटेंट अपडेट" },
  { tag: "राशिफल", text: "पंचांग-शैली ग्रिड अपने आप बनता है" },
  { tag: "संपादकीय", text: "हस्ताक्षरित कॉलम, पोर्ट्रेट सहित" },
  { tag: "खेल · व्यापार", text: "हर श्रेणी की खबरें अलग-अलग सेक्शन में" },
  { tag: "मास्टहेड", text: "दिन, तारीख़, अंक व मूल्य स्वतः अपडेट" },
  { tag: "PDF एक्सपोर्ट", text: "पूरा अंक एक क्लिक में प्रेस-रेडी" },
];

// Primary CTA and icon-tile classes copied verbatim from the dashboard
// (एक पेज बनाएं / पूरा अखबार बनाएं buttons) so the landing page's brand
// accent is the exact same emerald->teal gradient a publisher already sees
// once they're logged in, not a lookalike.
const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition-all duration-300 hover:from-emerald-500 hover:to-teal-500 hover:shadow-lg hover:shadow-emerald-500/35";
const GHOST_BTN =
  "inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3.5 text-sm font-semibold text-gray-900 transition hover:border-gray-400";
const ICON_TILE = "flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/30";

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function Ticker() {
  const row = (
    <div className="flex items-center gap-12 whitespace-nowrap">
      {TICKER_ITEMS.map((item) => (
        <span key={item.text} className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-full px-2 py-0.5">
            {item.tag}
          </span>
          {item.text}
        </span>
      ))}
    </div>
  );

  return (
    <div className="relative left-1/2 -ml-[50vw] w-screen border-y border-gray-200 bg-gray-50 overflow-hidden py-3.5">
      <div className="flex w-max gap-12 animate-landing-marquee">
        {row}
        {row}
      </div>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="relative flex items-center justify-center h-[420px] sm:h-[480px]">
      <div className="absolute w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.10),transparent_70%)]" />
      <div className="relative w-[320px] sm:w-[360px]">
        <div className="absolute inset-0 h-[270px] rounded-md border border-gray-200 bg-white shadow-xl shadow-emerald-900/10 rotate-6 translate-x-5 translate-y-2.5 opacity-50" />
        <div className="absolute inset-0 h-[280px] rounded-md border border-gray-200 bg-white shadow-xl shadow-emerald-900/10 -rotate-3 -translate-x-3 translate-y-1.5 opacity-75" />
        <div className="relative rounded-md border border-gray-200 bg-white shadow-2xl shadow-emerald-900/15 p-5 animate-landing-float-card">
          <span className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-2.5 py-1 text-[9.5px] font-bold tracking-wide text-white shadow-md shadow-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-landing-blink" /> LIVE जनरेशन
          </span>
          <div className="flex items-baseline justify-between border-b-[3px] border-double border-gray-900 pb-2 mb-3">
            <span className="font-extrabold text-2xl tracking-tight text-gray-950">दैनिक समाचार</span>
            <span className="text-right text-[9.5px] leading-relaxed text-gray-500">
              शनिवार, 30 अगस्त 2026
              <br />
              अंक 214 · संस्करण: शहर
            </span>
          </div>
          <div className="font-bold text-base leading-snug text-gray-950 mb-2">
            प्रदेश में नई योजना का शुभारंभ, लाखों को मिलेगा लाभ
          </div>
          <div className="relative h-[70px] rounded overflow-hidden mb-2 bg-gradient-to-br from-gray-200 to-gray-300">
            <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.6)_45%,transparent_60%)] bg-[length:220%_100%] animate-landing-shimmer" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            {[
              ["w-full", "w-[90%]", "w-[70%]"],
              ["w-[90%]", "w-full", "w-1/2"],
              ["w-[70%]", "w-[90%]", "w-full"],
            ].map((widths, colIdx) => (
              <div key={colIdx}>
                {widths.map((w, lineIdx) => (
                  <div key={lineIdx} className={`h-[5px] rounded-sm bg-gray-200 mb-1.5 ${w}`} />
                ))}
              </div>
            ))}
          </div>
          <div className="h-[5px] w-1/2 mx-auto rounded-sm bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

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
    <div>
      {/* Hero */}
      <section className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center pb-10">
        <div>
          <span className="opacity-0 animate-landing-fade-up inline-flex items-center gap-2.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500">
              <span className="absolute inset-[-4px] rounded-full border-[1.5px] border-emerald-500 opacity-55 animate-landing-pulse-ring" />
            </span>
            न्यूज़पेपर जनरेशन प्लेटफ़ॉर्म
          </span>
          <h1
            className="opacity-0 animate-landing-fade-up font-extrabold text-4xl sm:text-5xl leading-[1.1] tracking-tight text-gray-950 mt-6 mb-1"
            style={{ animationDelay: "0.16s" }}
          >
            खबर से लेकर{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">छपाई-योग्य पेज</span> तक —
            <br className="hidden sm:block" /> पूरी तरह स्वचालित
          </h1>
          <span className="block h-1 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-full mt-5 animate-landing-draw-line" />
          <p
            className="opacity-0 animate-landing-fade-up text-lg leading-8 text-gray-600 max-w-xl mt-6 mb-8"
            style={{ animationDelay: "0.28s" }}
          >
            हिंदी और अंग्रेज़ी दोनों में, दर्जनों पेशेवर लेआउट के साथ आपका पूरा अखबार अपने आप तैयार होता है — मुखपृष्ठ से लेकर भीतरी पन्नों तक, हर दिन ताज़ा कंटेंट के साथ, आपके अपने मास्टहेड और पहचान के साथ।
          </p>
          <div className="opacity-0 animate-landing-fade-up flex flex-col sm:flex-row gap-3.5" style={{ animationDelay: "0.4s" }}>
            <button onClick={() => setOpen(true)} className={PRIMARY_BTN}>
              पब्लिशर एक्सेस के लिए आवेदन करें
            </button>
            <Link href="/login" className={GHOST_BTN}>
              लॉगिन करें
            </Link>
          </div>
          <div
            className="opacity-0 animate-landing-fade-up flex gap-8 mt-9 pt-7 border-t border-gray-200"
            style={{ animationDelay: "0.52s" }}
          >
            <div>
              <div className="font-extrabold text-2xl text-gray-950">6–8</div>
              <div className="text-xs text-gray-500">कॉलम लेआउट विकल्प</div>
            </div>
            <div>
              <div className="font-extrabold text-2xl text-gray-950">2</div>
              <div className="text-xs text-gray-500">भाषाएं — हिंदी व अंग्रेज़ी</div>
            </div>
            <div>
              <div className="font-extrabold text-2xl text-gray-950">1 क्लिक</div>
              <div className="text-xs text-gray-500">में प्रिंट-रेडी PDF</div>
            </div>
          </div>
        </div>
        <HeroMock />
      </section>

      <Ticker />

      {/* Features */}
      <section id="features" className="py-16">
        <div className="max-w-xl mx-auto text-center mb-12">
          <span className="block text-xs font-extrabold uppercase tracking-widest text-emerald-700 mb-3">सुविधाएं</span>
          <h2 className="font-extrabold text-3xl sm:text-4xl leading-tight text-gray-950 mb-4">
            एक असली न्यूज़रूम जितना सक्षम इंजन
          </h2>
          <p className="text-base leading-7 text-gray-600">
            हर सुविधा उस काम के लिए बनाई गई है जो आमतौर पर डिज़ाइनर और सब-एडिटर मिलकर घंटों में करते हैं।
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-white border border-gray-200 rounded-2xl p-7 transition hover:-translate-y-1.5 hover:shadow-lg hover:border-gray-400"
            >
              <div className={`h-[52px] w-[52px] rounded-2xl mb-5 ${ICON_TILE}`}>
                <FeatureIcon>{feature.icon}</FeatureIcon>
              </div>
              <h3 className="font-bold text-lg text-gray-950 mb-2">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="py-10">
        <div className="rounded-3xl bg-gray-50 border border-gray-200 px-8 sm:px-14 py-16">
          <div className="max-w-xl mx-auto text-center mb-14">
            <span className="block text-xs font-extrabold uppercase tracking-widest text-emerald-700 mb-3">वर्कफ़्लो</span>
            <h2 className="font-extrabold text-3xl sm:text-4xl leading-tight text-gray-950 mb-4">
              आवेदन से लेकर अंक छपने तक, चार चरण
            </h2>
            <p className="text-base leading-7 text-gray-600">
              पूरी प्रक्रिया एडमिन-नियंत्रित है, ताकि हर पब्लिशर की पहचान और भुगतान सुरक्षित रहे।
            </p>
          </div>
          <div className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div className="hidden lg:block absolute top-[27px] left-14 right-14 h-px bg-gray-200" />
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.title} className="relative">
                <div className={`relative z-10 h-14 w-14 rounded-full font-extrabold text-xl mb-6 ${ICON_TILE}`}>
                  {i + 1}
                </div>
                <h3 className="font-bold text-lg text-gray-950 mb-2">{step.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="text-center py-20">
        <span className="block text-xs font-extrabold uppercase tracking-widest text-emerald-700 mb-3">शुरू करें</span>
        <h2 className="font-extrabold text-3xl sm:text-[2.5rem] leading-tight text-gray-950 max-w-2xl mx-auto mb-4">
          अपना अगला अंक, आज ही तैयार करें
        </h2>
        <p className="text-base leading-7 text-gray-600 max-w-lg mx-auto mb-9">
          आवेदन भेजें और एडमिन स्वीकृति के बाद कुछ ही मिनटों में अपने पहले अंक की तैयारी शुरू करें।
        </p>
        <div className="flex flex-col sm:flex-row gap-3.5 justify-center">
          <button onClick={() => setOpen(true)} className={PRIMARY_BTN}>
            पब्लिशर एक्सेस के लिए आवेदन करें
          </button>
          <Link href="/login" className={GHOST_BTN}>
            लॉगिन करें
          </Link>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-950">पब्लिशर आवेदन</h2>
                <p className="text-xs text-gray-500">जानकारी भरें, एडमिन approval देगा.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-950">बंद</button>
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
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              <button disabled={loading} className={`${PRIMARY_BTN} disabled:opacity-50`}>{loading ? "जमा हो रहा है..." : "आवेदन भेजें"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
