"use client";

import { useState } from "react";
import Image from "next/image";
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
        {/*
          Served at the size it is shown at. The catalogue's photographs
          are full-size files — a console is a 1920-pixel photograph — and
          the frame on a phone is about 350 pixels wide, so the whole file
          would be downloaded to be shrunk back down again.
        */}
        <Image
          src={active.src}
          alt={active.alt}
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 92vw"
          className="object-contain p-6"
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
              className={`relative w-20 overflow-hidden rounded-lg border bg-white transition-colors sm:w-24 ${
                i === index
                  ? "border-brand ring-1 ring-brand"
                  : "border-gray-200 hover:border-gray-400"
              }`}
              style={{ aspectRatio: "4 / 3" }}
            >
              <Image
                src={img.src}
                alt=""
                fill
                sizes="96px"
                className="object-contain p-1.5"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
