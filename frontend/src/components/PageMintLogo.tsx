import React from "react";

/**
 * The real PageMint mark, taken from pagemint.gautamenterprises.org.
 *
 * It is a blue-and-black artwork on a light ground, so it is always placed on
 * a white tile rather than tinted or dropped straight onto the dark sidebar --
 * that way it reads correctly wherever it appears, and does not fight the
 * emerald/teal the rest of the UI uses as its accent.
 *
 * Served as a plain <img> against pre-resized files in /public/brand, NOT via
 * next/image. A static image import makes Next process the file at build time
 * through `sharp`, which is a native module: it is absent here and is an
 * optional dependency in Docker too, so the production build fails outright
 * ("Could not load the sharp module"). A 12KB pre-sized PNG needs no build
 * pipeline, cannot break the build, and is smaller than what the optimiser
 * would have produced anyway.
 */
export function PageMintBadge({ size = 44 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center bg-white ring-1 ring-black/5"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 8px 18px -12px rgba(16,24,40,.35)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={size > 64 ? "/brand/pagemint-logo-256.png" : "/brand/pagemint-logo-96.png"}
        alt="PageMint"
        width={Math.round(size * 0.74)}
        height={Math.round(size * 0.74)}
        decoding="async"
        style={{
          width: size * 0.74,
          height: size * 0.74,
          objectFit: "contain",
        }}
      />
    </div>
  );
}

/**
 * Badge plus wordmark. `tone` picks the text colour for the surface it sits
 * on -- the publisher/admin sidebars are near-black, everything else is light.
 */
export function PageMintLockup({
  size = 40,
  tone = "dark",
  subtitle,
}: {
  size?: number;
  tone?: "dark" | "light";
  subtitle?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PageMintBadge size={size} />
      <div className="min-w-0">
        <div
          className={`truncate text-[15px] font-extrabold tracking-tight ${
            tone === "light" ? "text-white" : "text-gray-950"
          }`}
        >
          PageMint
        </div>
        {subtitle && (
          <div
            className={`truncate text-[11px] font-medium ${
              tone === "light" ? "text-white/55" : "text-gray-500"
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
