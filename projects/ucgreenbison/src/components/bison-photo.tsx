import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Real bison photo (USDA / Jack Dykinga, public domain), stylized with a
 * duotone SVG filter and a halftone dot overlay so it reads like a printed
 * broadsheet image rather than a stock photo. See public/bison.credit.txt.
 */
type BisonPhotoProps = {
  className?: string;
  imageClassName?: string;
  /** Visual treatment. "hero" is a full landscape; "crest" is a tight circular crop of the head. */
  variant?: "hero" | "crest";
  priority?: boolean;
  alt?: string;
};

export function BisonPhoto({
  className,
  imageClassName,
  variant = "hero",
  priority = false,
  alt = "A bison, photographed by the USDA, here printed in two-color ink.",
}: BisonPhotoProps) {
  const isCrest = variant === "crest";
  return (
    <>
      {/* Inline SVG filters: registered once per render but cheap and dedup-safe. */}
      <svg
        aria-hidden
        focusable="false"
        width="0"
        height="0"
        style={{ position: "absolute", width: 0, height: 0 }}
      >
        <defs>
          <filter id="bison-duotone" colorInterpolationFilters="sRGB">
            {/* Collapse to luminance */}
            <feColorMatrix
              type="matrix"
              values="0.2126 0.7152 0.0722 0 0
                      0.2126 0.7152 0.0722 0 0
                      0.2126 0.7152 0.0722 0 0
                      0      0      0      1 0"
            />
            {/* Punch the contrast */}
            <feComponentTransfer>
              <feFuncR type="linear" slope="1.35" intercept="-0.18" />
              <feFuncG type="linear" slope="1.35" intercept="-0.18" />
              <feFuncB type="linear" slope="1.35" intercept="-0.18" />
            </feComponentTransfer>
            {/* Map dark -> bison ink, light -> paper using table interpolation */}
            <feComponentTransfer>
              {/* paper ~ #f1ecdc (R 0.95, G 0.93, B 0.85) -> bison green ~ #1b3d2b (R 0.10, G 0.24, B 0.16) */}
              <feFuncR type="table" tableValues="0.10 0.95" />
              <feFuncG type="table" tableValues="0.24 0.93" />
              <feFuncB type="table" tableValues="0.16 0.85" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      <figure
        className={cn(
          "relative isolate overflow-hidden",
          isCrest
            ? "aspect-square rounded-full border border-foreground/30"
            : "aspect-[3/2] border border-foreground/30",
          className,
        )}
      >
        <Image
          src="/bison.jpg"
          alt={alt}
          fill
          priority={priority}
          sizes={
            isCrest
              ? "(min-width: 640px) 96px, 64px"
              : "(min-width: 1024px) 800px, 100vw"
          }
          className={cn(
            "object-cover",
            isCrest ? "object-[58%_38%] scale-[1.35]" : "object-center",
            imageClassName,
          )}
          style={{ filter: "url(#bison-duotone)" }}
        />

        {/* Halftone dot overlay — gives a "printed" texture without obscuring detail. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-multiply"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--ink) 0.6px, transparent 1.1px)",
            backgroundSize: isCrest ? "4px 4px" : "5px 5px",
          }}
        />

        {/* Subtle paper grain so it blends into the broadsheet body. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 mix-blend-multiply"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, color-mix(in oklab, var(--ink) 14%, transparent) 1px, transparent 2px), radial-gradient(circle at 70% 60%, color-mix(in oklab, var(--ink) 10%, transparent) 1px, transparent 2px)",
            backgroundSize: "14px 14px, 23px 23px",
          }}
        />
      </figure>
    </>
  );
}
