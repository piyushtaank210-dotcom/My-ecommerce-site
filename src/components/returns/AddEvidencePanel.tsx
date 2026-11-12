"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FilePlus2,
} from "lucide-react";
import {
  addReturnEvidenceAction,
  type ReturnActionState,
} from "@/lib/return-actions";

const initial: ReturnActionState = { ok: false };

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

type Pending = {
  file: File;
  url: string;
  kind: "photo" | "video";
  progress: number;
  status: "uploading" | "done" | "error";
  id: string | null;
  error?: string;
};

/**
 * Sending more evidence for a request.
 *
 * The shop can ask a customer for something they did not send the
 * first time. This is where they send it. The files that were sent
 * before are kept — this adds to them rather than replacing them — and
 * the request stays open until the shop has looked at what has arrived.
 */
export function AddEvidencePanel({
  returnId,
  askedFor,
}: {
  returnId: string;
  askedFor?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    addReturnEvidenceAction,
    initial
  );

  const [files, setFiles] = useState<Pending[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const uploadOne = (file: File, kind: "photo" | "video") =>
    new Promise<void>((resolve) => {
      const form = new FormData();
      form.append("files", file);
      form.append("evidenceKind", "other");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/returns/evidence");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        setFiles((prev) =>
          prev.map((f) =>
            f.file === file ? { ...f, progress: percent, status: "uploading" } : f
          )
        );
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          let id: string | null = null;
          try {
            id = JSON.parse(xhr.responseText)?.uploads?.[0]?.id ?? null;
          } catch {
            id = null;
          }
          setFiles((prev) =>
            prev.map((f) =>
              f.file === file
                ? {
                    ...f,
                    id,
                    progress: 100,
                    status: id ? "done" : "error",
                    error: id ? undefined : "The upload could not be read.",
                  }
                : f
            )
          );
        } else {
          let message = "The file could not be sent.";
          try {
            message = JSON.parse(xhr.responseText)?.error ?? message;
          } catch {
            // The answer was not the one we expected.
          }
          setFiles((prev) =>
            prev.map((f) => (f.file === file ? { ...f, status: "error", error: message } : f))
          );
        }
        resolve();
      };

      xhr.onerror = () => {
        setFiles((prev) =>
          prev.map((f) =>
            f.file === file
              ? { ...f, status: "error", error: "The file could not be sent." }
              : f
          )
        );
        resolve();
      };

      xhr.send(form);
    });

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    e.target.value = "";

    const accepted: Pending[] = [];
    for (const f of picked) {
      if (PHOTO_TYPES.includes(f.type)) {
        if (f.size > MAX_PHOTO_BYTES) {
          setError(`"${f.name}" is over 5MB. Please send a smaller photograph.`);
          return;
        }
        accepted.push({
          file: f,
          url: URL.createObjectURL(f),
          kind: "photo",
          progress: 0,
          status: "uploading",
          id: null,
        });
      } else if (VIDEO_TYPES.includes(f.type)) {
        if (f.size > MAX_VIDEO_BYTES) {
          setError(`"${f.name}" is over 60MB. Please send a shorter video.`);
          return;
        }
        accepted.push({
          file: f,
          url: URL.createObjectURL(f),
          kind: "video",
          progress: 0,
          status: "uploading",
          id: null,
        });
      } else {
        setError(
          `"${f.name}" is not a photograph or a video we can play. Use JPG, PNG or WebP for a photograph, and MP4, WebM or MOV for a video.`
        );
        return;
      }
    }

    setFiles((prev) => [...prev, ...accepted]);
    for (const item of accepted) {
      await uploadOne(item.file, item.kind);
    }
  };

  const remove = (index: number) => {
    setFiles((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].url);
      copy.splice(index, 1);
      return copy;
    });
  };

  const uploadIds = files
    .filter((f) => f.status === "done" && f.id)
    .map((f) => f.id as string);
  const uploading = files.some((f) => f.status === "uploading");

  return (
    <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
      <h3 className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
        <FilePlus2 className="h-3.5 w-3.5 text-brand" />
        Add more evidence
      </h3>
      <p className="mt-1 text-[12.5px] text-gray-600">
        {askedFor
          ? askedFor
          : "You can add photographs or a video to this request. What you send now is kept alongside what you sent before."}
      </p>

      {state.message && (
        <p
          className={`mt-3 flex items-center gap-1.5 text-[12.5px] font-medium ${
            state.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {state.message}
        </p>
      )}

      {error && (
        <p className="mt-3 text-[12.5px] font-medium text-red-600">{error}</p>
      )}

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="returnId" value={returnId} />
        <input type="hidden" name="uploadIds" value={uploadIds.join(",")} />

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {files.map((f, index) => (
              <li key={index} className="w-24">
                <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-white">
                  {f.kind === "video" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <video src={f.url} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={f.url} alt="Evidence preview" className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label="Remove file"
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1.5">
                  {f.status === "uploading" && (
                    <>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-gray-500">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        {f.progress}%
                      </p>
                    </>
                  )}
                  {f.status === "done" && (
                    <p className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Uploaded
                    </p>
                  )}
                  {f.status === "error" && (
                    <p className="flex items-start gap-1 text-[10.5px] font-semibold text-red-600">
                      <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                      <span>{f.error ?? "Upload failed"}</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-gray-700 hover:border-brand hover:text-brand">
          <Upload className="h-4 w-4" />
          Choose photographs or a video
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
        </label>

        <div>
          <label
            htmlFor={`evidence-note-${returnId}`}
            className="block text-[12.5px] font-semibold text-gray-700"
          >
            A note about what you are sending (optional)
          </label>
          <textarea
            id={`evidence-note-${returnId}`}
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: this is the box the controller came in."
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2.5 text-[13px] text-ink"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || uploading || uploadIds.length === 0}
          className="btn btn-primary btn-sm"
        >
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending...
            </>
          ) : (
            "Add this evidence"
          )}
        </button>
      </form>
    </div>
  );
}
