"use client";

import React, { useEffect } from "react";

/**
 * Phone: slides up from the bottom edge with a grabber, the way a native
 * sheet does. Tablet/desktop (sm+): reverts to a centred dialog, because a
 * full-width sheet on a wide screen looks like a mistake.
 *
 * Body scroll is locked while open -- without it the page behind scrolls
 * under your finger the moment the sheet's own content hits its end, which
 * is the clearest giveaway that a "sheet" is really just a div.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    // overflow:hidden alone does not hold on iOS -- the page still rubber-bands
    // behind the sheet, and on close the document snaps back to the top
    // because the locked body forgot where it was. Pinning the body at
    // -scrollY and restoring the offset afterwards keeps the background
    // exactly where the user left it.
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div className="animate-sheet-scrim-in absolute inset-0 bg-black/45" />

      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-in sm:animate-dialog-in relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-xl sm:rounded-xl sm:border sm:border-gray-200"
      >
        {/* Grabber: phones only, and purely an affordance -- it signals the
            sheet is dismissible before the user tries anything. */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="h-1.5 w-10 rounded-full bg-gray-300" />
        </div>

        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-3 sm:pt-5">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-bold text-gray-950">{title}</h2>}
              {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="बंद करें"
              className="tap shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700"
            >
              बंद
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>

        {/* max() rather than plain env(): on Android and in desktop browsers
            the inset reports 0, which would leave the primary action flush
            against the screen edge with nothing to grab. */}
        {/* The divider is a sheet affordance (the footer is pinned while the
            body scrolls under it); the desktop dialog never had one. */}
        {footer && (
          <div
            className="border-t border-gray-200 px-5 pt-4 sm:border-0 sm:pt-0"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
