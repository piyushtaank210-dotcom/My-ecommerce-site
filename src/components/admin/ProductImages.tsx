"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
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

/**
 * The photographs of a product.
 *
 * The back office owns them: photographs are uploaded here, put in the
 * order they should appear, and one of them is chosen as the main one —
 * the picture the cards, the search results and the catalogue table show.
 *
 * A product that has not been saved yet has nowhere to put a photograph,
 * so the upload is offered only once there is something to attach it to.
 */
export function ProductImages({
  slug,
  images: initial,
  mainPath,
  disabled = false,
}: {
  slug: string;
  images: ProductImage[];
  /** The picture the catalogue is currently showing for this product. */
  mainPath: string | null;
  disabled?: boolean;
}) {
  const [images, setImages] = useState<ProductImage[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ name: string; percent: number }[]>(
    []
  );
  /** The photograph a new file is to take the place of, if any. */
  const [replacing, setReplacing] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const canChange = Boolean(slug) && !disabled;

  async function send(
    url: string,
    options: RequestInit,
    failure: string
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
      router.refresh();
      return data.images ?? [];
    } catch {
      setError(failure);
      toast(failure, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !slug) return;
    const picked = Array.from(files);
    const replaceId = replacing;
    if (fileInput.current) fileInput.current.value = "";
    if (replaceInput.current) replaceInput.current.value = "";
    setReplacing(null);

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

  function setMain(id: string) {
    send(
      `/api/admin/products/${slug}/images`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "main", id }),
      },
      "The main photograph could not be changed."
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
      "The photograph could not be removed."
    );
  }

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
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((img, i) => {
            const isMain = img.path === mainPath;
            return (
              <li
                key={img.id}
                className={`admin-panel p-3 ${
                  isMain ? "border-brand shadow-[0_0_0_1px_var(--adm-accent)]" : ""
                }`}
              >
                <div className="flex gap-3">
                  <span
                    className="admin-thumb !h-20 !w-20"
                    style={{ aspectRatio: "1 / 1" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.path}
                      alt={img.alt ?? ""}
                      className="h-full w-full object-contain p-1"
                    />
                  </span>

                  <div className="min-w-0 flex-1">
                    {isMain ? (
                      <span className="admin-badge admin-badge--accent mb-1.5">
                        <Star className="h-3 w-3" />
                        Main photograph
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMain(img.id)}
                        disabled={busy || !canChange}
                        className="mb-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink disabled:opacity-50"
                      >
                        <Star className="h-3 w-3" />
                        Make this the main one
                      </button>
                    )}

                    <label
                      htmlFor={`alt-${img.id}`}
                      className="mb-1 block text-[11.5px] font-medium text-gray-500"
                    >
                      What this photograph shows
                    </label>
                    <input
                      id={`alt-${img.id}`}
                      type="text"
                      defaultValue={img.alt ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (img.alt ?? "")) {
                          setAlt(img.id, e.target.value);
                        }
                      }}
                      disabled={busy || !canChange}
                      placeholder="A console seen from the front"
                      className="input h-8 text-[12.5px]"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 border-t border-gray-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => move(img.id, -1)}
                    disabled={busy || !canChange || i === 0}
                    aria-label={`Move ${img.alt ?? "photograph"} earlier`}
                    className="admin-icon-btn"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(img.id, 1)}
                    disabled={busy || !canChange || i === images.length - 1}
                    aria-label={`Move ${img.alt ?? "photograph"} later`}
                    className="admin-icon-btn"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <span className="ml-1 text-[11.5px] text-gray-400">
                    {i === 0 ? "First" : `Position ${i + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplacing(img.id);
                      replaceInput.current?.click();
                    }}
                    disabled={busy || !canChange}
                    aria-label={`Replace ${img.alt ?? "photograph"}`}
                    title={`Replace ${img.alt ?? "photograph"}`}
                    className="admin-icon-btn ml-auto"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(img.id)}
                    disabled={busy || !canChange}
                    aria-label={`Remove ${img.alt ?? "photograph"}`}
                    title={`Remove ${img.alt ?? "photograph"}`}
                    className="admin-icon-btn admin-icon-btn--bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
        <label
          htmlFor="product-images"
          className={`btn btn-outline btn-sm ${!canChange || busy ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload photographs
        </label>
        <p className="text-[12px] text-gray-500">
          {canChange
            ? "JPEG, PNG, WebP, GIF or AVIF, up to 8 MB each."
            : "Save the product first, then add its photographs."}
        </p>
      </div>
    </div>
  );
}
