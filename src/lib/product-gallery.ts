import type { GalleryImage } from "./types";

/**
 * Extra photography for the products we have it for.
 *
 * A console is a big object and one photograph does not show it: the buyer
 * wants the disc drive, the ports, the back panel and what is in the box.
 * These are Sony's own shots of the hardware, so they are pictures of the
 * product being sold and not of something that merely looks like it.
 *
 * The images live in public/products/gallery/, resized to 1600px wide so a
 * gallery of six does not cost six megabytes.
 */
export const PRODUCT_GALLERY: Record<string, GalleryImage[]> = {
  "playstation-5-slim-disc-1tb": [
    {
      src: "/products/gallery/ps5-slim.jpg",
      alt: "PlayStation 5 Slim disc console lying on its side",
    },
    {
      src: "/products/gallery/ps5-slim-angled.jpg",
      alt: "PlayStation 5 Slim disc console seen from a low angle",
    },
    {
      src: "/products/gallery/ps5-slim-side.jpg",
      alt: "PlayStation 5 Slim disc console seen from the side",
    },
    {
      src: "/products/gallery/ps5-slim-back.jpg",
      alt: "PlayStation 5 Slim disc console seen from behind",
    },
    {
      src: "/products/gallery/ps5-slim-detail.jpg",
      alt: "Close-up of the disc drive on the PlayStation 5 Slim",
    },
    {
      src: "/products/gallery/ps5-slim-controller.jpg",
      alt: "The white DualSense controller that ships in the box",
    },
  ],
  "playstation-5-slim-digital-1tb": [
    {
      src: "/products/gallery/ps5-slim-digital.jpg",
      alt: "PlayStation 5 Slim digital console lying on its side",
    },
    {
      src: "/products/gallery/ps5-slim-controller.jpg",
      alt: "The white DualSense controller that ships in the box",
    },
  ],
};

/**
 * The photographs to show for a product: its gallery where one exists, and
 * otherwise the single image the catalogue carries.
 */
export function galleryFor(
  slug: string,
  image: string | null,
  name: string
): GalleryImage[] {
  const gallery = PRODUCT_GALLERY[slug];
  if (gallery?.length) return gallery;
  return image ? [{ src: image, alt: name }] : [];
}
