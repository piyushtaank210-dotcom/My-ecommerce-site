"use client";

import { useState } from "react";
import type { GalleryImage } from "@/lib/types";

export type { GalleryImage };

/**
 * The product photograph with a strip of thumbnails underneath.
 *
 * A store that shows one picture of a console asks the customer to trust the
 * picture; a store that shows every angle of it does not. Only the products
 * we have real photography for get a gallery — the rest fall back to the
 * single image the catalogue already carries.
 */
export function ProductGallery({
  images,
  badge,
}: {
  images: GalleryImage[];
  badge?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) return null;

  const active = images[Math.min(index, images.length - 1)];

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.src}
          alt={active.alt}
          className="h-full w-full object-contain p-6"
        />
        {badge}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Product images">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={img.alt}
              onClick={() => setIndex(i)}
              className={`w-20 overflow-hidden rounded-lg border bg-white transition-colors sm:w-24 ${
                i === index
                  ? "border-brand ring-1 ring-brand"
                  : "border-gray-200 hover:border-gray-400"
              }`}
              style={{ aspectRatio: "4 / 3" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt="" className="h-full w-full object-contain p-1.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
