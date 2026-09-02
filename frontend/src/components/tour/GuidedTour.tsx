"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  isTourEnabled,
  setTourEnabled,
  TOUR_EVENT,
  TOUR_SEEN_KEY,
  type TourStep,
} from "./tourSteps";

/**
 * Guided tour: dims the screen, spotlights one control at a time, and points
 * at it with a hand-drawn chalk arrow.
 *
 * Performance notes, because this sits on top of the whole app:
 *  - The overlay is only mounted while the tour runs. When it is off (the
 *    normal case, every launch after the first) this component renders null
 *    and costs nothing beyond one event listener.
 *  - The dim layer is a single element using one large box-shadow to punch
 *    the spotlight hole. That paints once per step, not per frame -- far
 *    cheaper than an SVG mask or four separate panels being re-laid out.
 *  - Every looping animation (the target pulse) animates transform/opacity
 *    only, so it stays on the compositor.
 *  - Geometry is measured once per step rather than on scroll: the page is
 *    scroll-locked while the tour is open, so the target cannot move.
 */

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
/**
 * Distance between the spotlight and the card. Big enough that the chalk
 * arrow has room to actually curve -- at ~18px it rendered as an unreadable
 * squiggle rather than an arrow.
 */
const CARD_GAP = 74;

export default function GuidedTour({
  steps,
  autoStart = true,
}: {
  steps: TourStep[];
  autoStart?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardTop, setCardTop] = useState(0);
  const [placeBelow, setPlaceBelow] = useState(true);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Only steps whose target actually exists on this screen.
  const visibleSteps = useRef<TourStep[]>(steps);
  const step = visibleSteps.current[index];

  const collectSteps = useCallback(() => {
    visibleSteps.current = steps.filter((s) =>
      document.querySelector(`[data-tour="${s.target}"]`),
    );
    return visibleSteps.current.length > 0;
  }, [steps]);

  const begin = useCallback(() => {
    if (!collectSteps()) return;
    setIndex(0);
    setOpen(true);
  }, [collectSteps]);

  // Replay on demand (Settings toggle / help button).
  useEffect(() => {
    const onStart = () => begin();
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [begin]);

  // First visit: auto-run once if the tutorial toggle is on. After that it
  // stays quiet until the help button is pressed or the toggle is turned on.
  useEffect(() => {
    if (!autoStart) return;
    let seen = true;
    try {
      seen = window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen || !isTourEnabled()) return;

    const timer = window.setTimeout(() => begin(), 1200);
    return () => window.clearTimeout(timer);
  }, [autoStart, begin]);

  const finish = useCallback((turnOff = false) => {
    setOpen(false);
    setRect(null);
    try {
      window.localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
    if (turnOff) setTourEnabled(false);
  }, []);

  // Scroll-lock while open, so measured geometry stays valid.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prev = { overflow: body.style.overflow };
    body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, visibleSteps.current.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      body.style.overflow = prev.overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, finish]);

  // Measure the current target. Runs on step change and on resize only.
  useLayoutEffect(() => {
    if (!open || !step) return;

    let cancelled = false;

    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (cancelled) return;

      const next: Rect = {
        top: r.top - PAD,
        left: r.left - PAD,
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      };
      setRect(next);

      // Card height is only known once it has rendered; fall back to a
      // reasonable estimate on the first pass, then correct below.
      const cardH = cardRef.current?.offsetHeight || 210;
      const vh = window.innerHeight;
      const spaceBelow = vh - (next.top + next.height);
      const spaceAbove = next.top;

      const below =
        step.placement === "bottom"
          ? true
          : step.placement === "top"
            ? false
            : spaceBelow >= cardH + CARD_GAP + 12 || spaceBelow >= spaceAbove;

      // Positioned by the card's real top edge (no translate trick), so it
      // can be clamped honestly into the viewport. Without this the card
      // slid off the bottom of the screen and its buttons were unreachable.
      const desired = below
        ? next.top + next.height + CARD_GAP
        : next.top - CARD_GAP - cardH;

      setPlaceBelow(below);
      setCardTop(Math.min(Math.max(12, desired), Math.max(12, vh - cardH - 12)));
    };

    // Bring the target into view first; it may be far down the page.
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "";
      el.scrollIntoView({ block: "center", behavior: "auto" });
      document.body.style.overflow = prevOverflow;
    }

    // One frame later so scrolling has been applied.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [open, step, index]);

  if (!open || !step || !rect) return null;

  const total = visibleSteps.current.length;
  const isLast = index === total - 1;

  // Chalk arrow: a curve from the card's nearest edge to the spotlight.
  // Drawn in a small fixed-size SVG so the stroke animation stays cheap.
  const cardH = cardRef.current?.offsetHeight || 210;
  const targetCx = rect.left + rect.width / 2;
  const targetY = placeBelow ? rect.top + rect.height : rect.top;
  const cardY = placeBelow ? cardTop : cardTop + cardH;
  const arrowTop = Math.min(targetY, cardY);
  const gap = placeBelow ? cardY - targetY : targetY - cardY;
  // With a tall target the clamped card can end up sitting over it, leaving
  // no room to draw into. A stub arrow there reads as a smudge, so it is
  // simply not drawn.
  const showArrow = gap >= 40;
  const arrowHeight = Math.max(gap, 1);
  const dir = placeBelow ? -1 : 1; // arrow points up at the target, or down

  // Curve control point offset to one side gives the hand-drawn "swoop".
  const sway = Math.min(60, Math.max(28, arrowHeight * 0.55));
  const startY = placeBelow ? arrowHeight : 0;
  const endY = placeBelow ? 0 : arrowHeight;
  const path = `M 60 ${startY} C ${60 - sway} ${startY + dir * arrowHeight * 0.35}, ${60 + sway * 0.6} ${endY - dir * arrowHeight * 0.3}, 60 ${endY}`;

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="ट्यूटोरियल">
      {/* Dim + spotlight hole in one element. */}
      <div
        className="tour-spotlight"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
        onClick={() => finish()}
      />

      {/* Pulsing ring on the highlighted control. */}
      <div
        className="tour-pulse"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />

      {/* Chalk arrow between card and target. */}
      {showArrow && (
      <svg
        className="tour-arrow"
        style={{ top: arrowTop, left: targetCx - 60, height: arrowHeight, width: 120 }}
        viewBox={`0 0 120 ${arrowHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Two offset strokes fake chalk grain without an SVG filter, which
            would cost a full-surface repaint. */}
        <path className="tour-arrow-under" d={path} />
        <path className="tour-arrow-line" d={path} />
        <path
          className="tour-arrow-head"
          d={
            placeBelow
              ? `M ${60 - 9} ${12} L 60 0 L ${60 + 9} ${12}`
              : `M ${60 - 9} ${arrowHeight - 12} L 60 ${arrowHeight} L ${60 + 9} ${arrowHeight - 12}`
          }
        />
      </svg>
      )}

      {/* Step card */}
      <div
        ref={cardRef}
        className={`tour-card ${placeBelow ? "is-below" : "is-above"}`}
        style={{
          top: cardTop,
          left: Math.min(
            Math.max(12, targetCx - 160),
            Math.max(12, window.innerWidth - 332),
          ),
        }}
      >
        <div className="tour-card-head">
          <span className="tour-step-count">
            {index + 1} / {total}
          </span>
          <button type="button" onClick={() => finish(true)} className="tour-skip">
            छोड़ें
          </button>
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>

        <div className="tour-dots" aria-hidden="true">
          {visibleSteps.current.map((s, i) => (
            <span key={s.target} className={i === index ? "is-on" : ""} />
          ))}
        </div>

        <div className="tour-actions">
          {index > 0 && (
            <button type="button" className="tour-btn-ghost" onClick={() => setIndex((i) => i - 1)}>
              पीछे
            </button>
          )}
          <button
            type="button"
            className="tour-btn-primary"
            onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
          >
            {isLast ? "समझ गया" : "आगे"}
          </button>
        </div>
      </div>
    </div>
  );
}
