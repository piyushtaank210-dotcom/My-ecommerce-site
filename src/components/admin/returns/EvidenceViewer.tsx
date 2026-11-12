"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  Video,
  Download,
  Maximize2,
  FileText,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import {
  EVIDENCE_KIND_LABEL,
  type EvidenceKind,
  type ReturnImage,
} from "@/lib/return-status";
import { formatDate } from "@/lib/format";

/**
 * The evidence a customer sent, seen by the back office.
 *
 * Every file is fetched through the route that checks who is asking, so
 * the photographs and videos of a claim are private to the shop and to
 * the customer who sent them. The files can be looked at full size,
 * played, and downloaded, and every one of them carries the time it
 * arrived.
 */
export function EvidenceViewer({
  returnId,
  images,
}: {
  returnId: string;
  images: ReturnImage[];
}) {
  const [playing, setPlaying] = useState<number | null>(null);

  if (!images.length) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-[12.5px] text-gray-500">
        No evidence has been sent with this request yet.
      </p>
    );
  }

  const photoCount = images.filter((i) => i.kind === "photo").length;
  const videoCount = images.length - photoCount;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <ImageIcon className="h-3.5 w-3.5" />
          {photoCount} photograph{photoCount === 1 ? "" : "s"}
        </span>
        <span className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1">
          <Video className="h-3.5 w-3.5" />
          {videoCount} video{videoCount === 1 ? "" : "s"}
        </span>
        <span className="text-gray-300">·</span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Private to the shop and the customer
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img) => {
          const src = `/api/returns/${returnId}/evidence/${img.id}`;
          const isVideo = img.kind === "video";

          return (
            <li
              key={img.id}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <div className="relative h-40 bg-gray-50">
                {isVideo ? (
                  playing === img.id ? (
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <video
                      src={src}
                      controls
                      autoPlay
                      className="h-full w-full"
                    />
                  ) : (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <video
                        src={src}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                      <button
                        type="button"
                        onClick={() => setPlaying(img.id)}
                        className="absolute inset-0 grid place-items-center bg-black/25 text-white transition-colors hover:bg-black/40"
                      >
                        <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold">
                          <Video className="h-3.5 w-3.5" />
                          Play video
                        </span>
                      </button>
                    </>
                  )
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={src}
                    alt={EVIDENCE_KIND_LABEL[img.evidence_kind] ?? "Evidence"}
                    className="h-full w-full object-cover"
                  />
                )}

                <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {EVIDENCE_KIND_LABEL[img.evidence_kind as EvidenceKind] ??
                    img.evidence_kind}
                </span>
                {img.superseded > 0 && (
                  <span className="absolute right-2 top-2 rounded bg-gray-800/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Earlier round
                  </span>
                )}
              </div>

              <div className="space-y-1.5 p-3">
                <p className="truncate text-[12px] font-medium text-ink">
                  {img.original_name ?? `Evidence ${img.id}`}
                </p>

                <p className="flex items-center gap-1 text-[11.5px] text-gray-500">
                  <Clock3 className="h-3 w-3" />
                  Uploaded {formatDate(img.created_at)}
                </p>

                <p className="text-[11.5px] text-gray-500">
                  Round {img.version} · sent by{" "}
                  {img.uploaded_by_type === "staff" ? "the shop" : "the customer"}
                  {img.size_bytes
                    ? ` · ${(img.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                    : ""}
                </p>

                {img.note && (
                  <p className="rounded bg-amber-50 p-2 text-[11.5px] text-amber-800">
                    <FileText className="mr-1 inline h-3 w-3" />
                    {img.note}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-xs inline-flex items-center gap-1"
                  >
                    <Maximize2 className="h-3 w-3" />
                    Full size
                  </a>
                  <a
                    href={`${src}?download=1`}
                    className="btn btn-outline btn-xs inline-flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
