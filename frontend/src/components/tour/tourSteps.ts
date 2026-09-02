/**
 * Guided-tour step definitions.
 *
 * A step points at a real element via `data-tour="<target>"`. Steps whose
 * target is not on the page are skipped automatically, so one list can cover
 * a screen whose controls differ by publisher (the manual-news button, for
 * instance, is not shown to everyone) without going out of sync.
 */
export type TourStep = {
  /** Matches data-tour="..." on the element to highlight. */
  target: string;
  title: string;
  body: string;
  /** Where the card sits relative to the target. "auto" picks the side with room. */
  placement?: "auto" | "top" | "bottom";
};

export const DASHBOARD_TOUR: TourStep[] = [
  {
    target: "issue-fields",
    title: "1. अंक नंबर और तारीख",
    body: "सबसे पहले यहाँ अंक नंबर और प्रकाशन की तारीख भरें। खाली छोड़ेंगे तो आज की तारीख अपने आप लग जाएगी।",
  },
  {
    target: "single-page",
    title: "2. एक पेज बनाएं",
    body: "सिर्फ़ एक पेज बनाना हो तो यहाँ से पेज नंबर चुनें। पैसा तभी कटेगा जब PDF सफल बनेगा।",
  },
  {
    target: "full-issue",
    title: "3. पूरा अखबार बनाएं",
    body: "पूरा अंक एक साथ बनाने के लिए यह चुनें — सभी पेज बनकर एक PDF में मिल जाएंगे।",
  },
  {
    target: "wallet-chip",
    title: "4. वॉलेट बैलेंस",
    body: "यहाँ आपका मौजूदा बैलेंस दिखता है। टैप करके रिचार्ज कर सकते हैं — ₹50 प्रति पेज कटता है।",
  },
];

export const TOUR_EVENT = "pagemint:start-tour";
export const TOUR_SEEN_KEY = "pagemint-tour-seen-v1";
export const TOUR_ENABLED_KEY = "pagemint-tour-enabled";
export const TOUR_SETTING_EVENT = "pagemint:tour-setting-changed";

/** Fired by the Settings toggle / help button to replay the tour on demand. */
export function startTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

export function isTourEnabled() {
  try {
    return window.localStorage.getItem(TOUR_ENABLED_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setTourEnabled(on: boolean) {
  try {
    window.localStorage.setItem(TOUR_ENABLED_KEY, on ? "on" : "off");
    // Turning it back on should mean "show it to me again", not "remember
    // that I already saw it months ago".
    if (on) window.localStorage.removeItem(TOUR_SEEN_KEY);
  } catch {
    /* private mode -- the tour simply runs every time */
  }
  window.dispatchEvent(new CustomEvent(TOUR_SETTING_EVENT, { detail: { on } }));
}
