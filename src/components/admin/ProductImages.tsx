"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  ImagePlus,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import type { ProductImage } from "@/lib/types";
import { toast } from "@/components/Toaster";
import { uploadFiles } from "@/lib/upload-client";
import { queuedFor, queueUploads, takeUploads } from "./product-editor/pending-uploads";

/**
 * The photographs of a product.
 *
 * The back office owns them: photographs are uploaded here, put in the
 * order they should appear, and one of them is chosen as the main one —
 * the picture the cards, the search results and the catalogue table show.
 *
 * The order may be set by dragging a photograph onto another, or with the
 * two buttons beside it, which do the same thing for anyone who cannot
 * drag or who would rather not.
 *
 * A product that has not been saved yet has nowhere to put a photograph,
 * so the chosen files are held until it has been saved, and are uploaded
 * the moment it is.
 */
export const ProductImages = memo(function ProductImages({
  slug,
  images: initial,
  mainPath,
  saved = true,
}: {
  slug: string;
  images: ProductImage[];
  /** The picture the catalogue is currently showing for this product. */
  mainPath: string | null;
  /** Whether the product exists yet, and so can hold a photograph. */
  saved?: boolean;
}) {
  const [images, setImages] = useState<ProductImage[]>(initial);
  const [main, setMain] = useState<string | null>(mainPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ name: string; percent: number }[]>(
    []
  );
  /** The photograph a new file is to take the place of, if any. */
  const [replacing, setReplacing] = useState<string | null>(null);
  /** The photograph being dragged, and the one it is over. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /**
   * The photograph being dragged, kept in a box as well.
   *
   * A drag is over in a moment, and the page may not have redrawn in
   * that time, so the state — which is what is drawn — cannot be what is
   * read. The box is always current.
   */
  const dragged = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // The photographs the server sent are the truth.
  useEffect(() => setImages(initial), [initial]);
  useEffect(() => setMain(mainPath), [mainPath]);

  // How many photographs are waiting for this product to be saved.
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!slug) return;
    setWaiting(queuedFor(slug));
  }, [slug, images]);

  /**
   * The photographs that were chosen before the product was saved.
   *
   * They are uploaded as soon as there is a product to put them on.
   */
  useEffect(() => {
    if (!saved || !slug) return;
    const held = takeUploads(slug);
    if (!held.length) return;
    void upload(held);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, slug]);

  /**
   * Sends a change to the server.
   *
   * The server answers with the whole gallery, so the page does not have
   * to be read again — except when the change was to the main
   * photograph, which is the one thing the page carries itself.
   */
  async function send(
    url: string,
    options: RequestInit,
    failure: string,
    refresh = false
  ): Promise<ProductImage[] | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? failure);
        toast(data?.error ?? failure, "error");
        return null;
      }
      setImages(data.images ?? []);
      if (refresh) router.refresh();
      return data.images ?? [];
    } catch {
      setError(failure);
      toast(failure, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | File[] | null) {
    const picked = Array.from(files ?? []);
    if (!picked.length || !slug) return;
    const replaceId = replacing;
    if (fileInput.current) fileInput.current.value = "";
    if (replaceInput.current) replaceInput.current.value = "";
    setReplacing(null);

    // There is no product to hold a photograph yet, so the files are held
    // until the product has been saved.
    if (!saved) {
      queueUploads(slug, picked);
      setWaiting(queuedFor(slug));
      toast(
        picked.length === 1
          ? "The photograph will be uploaded once the product is saved."
          : `${picked.length} photographs will be uploaded once the product is saved.`,
        "success"
      );
      return;
    }

    setBusy(true);
    setError(null);
    setProgress(picked.map((file) => ({ name: file.name, percent: 0 })));

    const outcome = await uploadFiles({
      ticketUrl: "/api/admin/uploads",
      commitUrl: "/api/admin/uploads",
      files: picked,
      payload: { target: "product-images", slug, replaceId: replaceId ?? "" },
      appFields: replaceId ? { replaceId } : {},
      onProgress: (index, percent) => {
        setProgress((prev) =>
          prev.map((p, i) => (i === index ? { ...p, percent } : p))
        );
      },
    });

    setProgress([]);

    if (!outcome.ok) {
      const message = outcome.error ?? "The photograph could not be uploaded.";
      setError(message);
      toast(message, "error");
      setBusy(false);
      return;
    }

    const gallery = (outcome.data as { images?: ProductImage[] })?.images;
    if (gallery) setImages(gallery);
    router.refresh();
    setBusy(false);
    if (replaceId) {
      toast("The photograph was replaced.", "success");
      return;
    }
    toast(
      picked.length === 1
        ? "The photograph was uploaded."
        : `${picked.length} photographs were uploaded.`,
      "success"
    );
  }

  function move(id: string, by: number) {
    const ids = images.map((i) => i.id);
    const at = ids.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(at, 1)[0]);
    send(
      `/api/admin/products/${slug}/images`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reorder", ids }),
      },
      "The photographs could not be reordered."
    );
  }

  /**
   * Puts a dragged photograph where it was dropped.
   *
   * The photograph that was dragged takes the place of the one it was
   * dropped on, and the rest keep their order.
   */
  function dropOn(targetId: string) {
    setOver(null);
    // The photograph being dragged is kept in a box as well as in the
    // state: the state is what is drawn, and the box is what is read,
    // because a drag is over before the page has had a chance to redraw.
    const from = dragged.current;
    setDragging(null);
    if (!from || from === targetId) return;
    const ids = images.map((i) => i.id);
    const at = ids.indexOf(from);
    const to = ids.indexOf(targetId);
    if (at < 0 || to < 0) return;
    ids.splice(at, 1);
    ids.splice(to, 0, from);
    send(
      `/api/admin/products/${slug}/images`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reorder", ids }),
      },
      "The photographs could not be reordered."
    );
  }

  function setMainImage(id: string, path: string) {
    setMain(path);
    send(
      `/api/admin/products/${slug}/images`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "main", id }),
      },
      "The main photograph could not be changed.",
      // The main photograph is the one the page carries itself, so the
      // page has to be read again.
      true
    );
  }

  function setAlt(id: string, alt: string) {
    send(
      `/api/admin/products/${slug}/images`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "alt", id, alt }),
      },
      "The description could not be saved."
    );
  }

  function remove(id: string) {
    send(
      `/api/admin/products/${slug}/images`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      },
      "The photograph could not be removed.",
      // Removing the main photograph changes the one the page carries.
      true
    );
  }

  const canChange = Boolean(slug) && saved && !busy;

  /**
   * Which photograph is the main one.
   *
   * The catalogue names it, and normally that is one of these photographs.
   * A product whose card picture was set before its gallery was filled in
   * names one that is not here — and then the first photograph is the one
   * the shop shows first, so that is what is marked.
   */
  const namedMain = images.findIndex((i) => i.path === main);
  const mainAt = namedMain >= 0 ? namedMain : 0;

  return (
    <div>
      {images.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-[13px] text-gray-500">
          <ImagePlus className="h-5 w-5 shrink-0 text-gray-400" />
          <span>
            No photographs yet. A product with a picture of its own sells
            better than one without.
          </span>
        </div>
      ) : (
        <ul className="admin-gallery-grid">
          {images.map((img, i) => {
            const isMain = i === mainAt;
            return (
              <li
                key={img.id}
                className="admin-gallery-item"
                data-main={isMain ? "true" : "false"}
                data-dragging={dragging === img.id ? "true" : "false"}
                data-over={over === img.id ? "true" : "false"}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOver(img.id);
                }}
                onDragLeave={() => setOver((o) => (o === img.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(img.id);
                }}
              >
                <div
                  className="admin-gallery-thumb"
                  draggable
                  onDragStart={(e) => {
                    dragged.current = img.id;
                    setDragging(img.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", img.id);
                  }}
                  onDragEnd={() => {
                    dragged.current = null;
                    setDragging(null);
                    setOver(null);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.path} alt={img.alt ?? ""} />
                  <button
                    type="button"
                    onClick={() => setMainImage(img.id, img.path)}
                    disabled={busy || !canChange}
                    data-main={isMain ? "true" : "false"}
                    aria-label={
                      isMain
                        ? "This is the main photograph"
                        : "Make this the main photograph"
                    }
                    title={
                      isMain
                        ? "This is the main photograph"
                        : "Make this the main photograph"
                    }
                    className="admin-gallery-star"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="admin-gallery-tools">
                  <span
                    aria-hidden
                    title="Drag to reorder"
                    className="grid h-[26px] w-[22px] place-items-center text-gray-300"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => move(img.id, -1)}
                    disabled={busy || !canChange || i === 0}
                    aria-label={`Move photograph ${i + 1} earlier`}
                    title="Move earlier"
                    className="admin-icon-btn !h-[26px] !w-[26px]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(img.id, 1)}
                    disabled={busy || !canChange || i === images.length - 1}
                    aria-label={`Move photograph ${i + 1} later`}
                    title="Move later"
                    className="admin-icon-btn !h-[26px] !w-[26px]"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplacing(img.id);
                      replaceInput.current?.click();
                    }}
                    disabled={busy || !canChange}
                    aria-label={`Replace photograph ${i + 1}`}
                    title="Replace"
                    className="admin-icon-btn !h-[26px] !w-[26px]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(img.id)}
                    disabled={busy || !canChange}
                    aria-label={`Remove photograph ${i + 1}`}
                    title="Remove"
                    className="admin-icon-btn admin-icon-btn--bad !h-[26px] !w-[26px]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="admin-gallery-foot">
                  <input
                    type="text"
                    defaultValue={img.alt ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (img.alt ?? "")) {
                        setAlt(img.id, e.target.value);
                      }
                    }}
                    disabled={busy || !canChange}
                    placeholder="What this photograph shows"
                    aria-label={`What photograph ${i + 1} shows`}
                    className="input !h-7 !text-[11.5px]"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="admin-notice admin-notice--bad mt-3">
          <span>{error}</span>
        </p>
      )}

      {progress.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {progress.map((p, i) => (
            <li
              key={`${p.name}-${i}`}
              className="flex items-center gap-2 text-[11.5px] text-gray-500"
            >
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
                <span
                  className="block h-full rounded-full bg-brand transition-all"
                  style={{ width: `${p.percent}%` }}
                />
              </span>
              <span className="truncate">{p.name}</span>
              <span className="tnum">{p.percent}%</span>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        onChange={(e) => upload(e.target.files)}
        disabled={!canChange || busy}
        className="hidden"
        id="product-images"
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={(e) => upload(e.target.files)}
        disabled={!canChange || busy}
        className="hidden"
        id="product-image-replace"
      />

      {waiting > 0 && (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-brand-dark">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {waiting === 1
            ? "One photograph is waiting. It will be uploaded as soon as the product is saved."
            : `${waiting} photographs are waiting. They will be uploaded as soon as the product is saved.`}
        </p>
      )}
    </div>
  );
});
