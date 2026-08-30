import React from "react";

/**
 * The PageMint wordmark's badge: a folded page (what the platform prints)
 * with a small spark at the fold, standing in for "mint" -- a page fresh
 * off the press, not a coin. Drawn as one inline SVG (not a raster asset)
 * so it stays crisp at every badge size. Colours are fixed white-on-white
 * (not currentColor) because the badge itself already carries the
 * dashboard's emerald->teal gradient fill -- see PageMintBadge.
 */
export function PageMintMark({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path
        d="M6 3.5h8.2L18.5 7.6V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        fill="#ffffff"
        fillOpacity="0.94"
      />
      <path d="M14.2 3.5V7.6H18.5" fill="none" stroke="#0d9488" strokeWidth="1" opacity="0.4" />
      <path
        d="M7.6 12.3H13.6M7.6 15.3H13.6M7.6 18.3H11.2"
        stroke="#0d9488"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path d="M17.3 3.9l1 2.1 2.1 1-2.1 1-1 2.1-1-2.1-2.1-1 2.1-1Z" fill="#ffffff" />
    </svg>
  );
}

export function PageMintBadge({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-600 shadow-sm shadow-emerald-500/30"
      style={{ width: size, height: size, borderRadius: size * 0.23 }}
    >
      <PageMintMark style={{ width: size * 0.6, height: size * 0.6 }} />
    </div>
  );
}
