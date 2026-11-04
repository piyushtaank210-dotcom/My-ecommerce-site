"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import type {
  ColumnSpec,
  ImportPreview,
  ImportRow,
} from "@/lib/product-import";

/**
 * Reading and writing the catalogue as a spreadsheet.
 *
 * The file is read first and nothing is written: the administrator sees
 * every row, what it would do and what is wrong with it, and only then
 * says go. An import only ever touches the products in the file.
 */
export function ImportPanel({
  columns,
  canManage,
}: {
  columns: ColumnSpec[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  async function send(url: string, withFile: File): Promise<any> {
    const data = new FormData();
    data.append("file", withFile);
    const res = await fetch(url, { method: "POST", body: data });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(body?.error ?? "The file could not be read.");
    }
    return body;
  }

  async function read() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const body = await send("/api/admin/products/import", file);
      setPreview(body);
      if (body.summary.errors > 0) {
        toast(
          `${body.summary.errors} row${body.summary.errors === 1 ? "" : "s"} cannot be used.`,
          "error"
        );
      } else {
        toast("The file has been read. Nothing has been changed yet.", "success");
      }
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = await send("/api/admin/products/import/apply", file);
      setPreview(body.preview);
      setDone(body.summary);
      toast(
        `${body.summary.created} made, ${body.summary.updated} changed, ${body.summary.skipped} skipped.`,
        body.summary.skipped ? "error" : "success"
      );
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function choose(next: File | null) {
    setFile(next);
    setPreview(null);
    setDone(null);
    setError(null);
  }

  const usable = preview
    ? preview.rows.filter((r) => r.action !== "error").length
    : 0;

  return (
    <div className="space-y-6">
      {/* Getting the file in and out */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
          <FileSpreadsheet className="h-4 w-4 text-brand" />
          Import and export
        </h2>
        <p className="mb-5 text-[12.5px] text-gray-500">
          Take the catalogue out as a spreadsheet, change it, and bring it
          back. An import only ever touches the products in the file — the
          rest of the catalogue is left exactly as it is.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/admin/products/export"
            className="btn btn-outline btn-sm"
            download
          >
            <Download className="h-4 w-4" />
            Export the catalogue
          </a>
          <a
            href="/api/admin/products/import/template"
            className="btn btn-outline btn-sm"
            download
          >
            <Download className="h-4 w-4" />
            Download the template
          </a>
        </div>

        {canManage && (
          <div className="mt-5 border-t border-gray-200 pt-5">
            <label htmlFor="import-file" className="label">
              A file to import
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInput}
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
                className="input h-9 max-w-md text-[12.5px] file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-2 file:py-1 file:text-[12px]"
              />
              <button
                type="button"
                onClick={read}
                disabled={!file || busy}
                className="btn btn-outline btn-sm"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Read the file
              </button>
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    choose(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="text-[12.5px] text-gray-500 hover:text-ink"
                >
                  Choose another
                </button>
              )}
            </div>
            <p className="mt-2 text-[12px] text-gray-500">
              Reading a file changes nothing. You will see what it would do
              before anything is written.
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
          >
            {error}
          </p>
        )}
      </section>

      {/* The preview */}
      {preview && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-ink">
                What the file would do
              </h2>
              <p className="mt-1 text-[12.5px] text-gray-500">
                {preview.filename} · {preview.summary.total} row
                {preview.summary.total === 1 ? "" : "s"}
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={apply}
                disabled={busy || usable === 0}
                className="btn btn-primary btn-sm"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Import {usable} record{usable === 1 ? "" : "s"}
              </button>
            )}
          </div>

          {preview.missingColumns.length > 0 && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
              The file is missing{" "}
              <span className="font-semibold">{preview.missingColumns.join(", ")}</span>
              , so every row will be refused.
            </p>
          )}
          {preview.unknownColumns.length > 0 && (
            <p className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12.5px] text-gray-600">
              The file has columns that are not read:{" "}
              <span className="font-medium">{preview.unknownColumns.join(", ")}</span>
              . They are left out rather than guessed at.
            </p>
          )}

          <div className="mb-4 flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full bg-green-50 px-2.5 py-1 font-semibold text-green-700">
              {preview.summary.created} to make
            </span>
            <span className="rounded-full bg-brand-tint px-2.5 py-1 font-semibold text-brand">
              {preview.summary.updated} to change
            </span>
            {preview.summary.errors > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                {preview.summary.errors} that cannot be used
              </span>
            )}
          </div>

          {preview.rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-gray-500">
              The file has no rows in it.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead className="border-b border-gray-200 text-[11.5px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold">What will happen</th>
                    <th className="px-3 py-2 font-semibold">Problems</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {preview.rows.map((row: ImportRow) => (
                    <tr key={row.row} className="align-top">
                      <td className="tnum px-3 py-2.5 text-gray-500">
                        {row.row}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block font-medium text-ink">
                          {row.name || "—"}
                        </span>
                        <span className="block truncate text-[11.5px] text-gray-500">
                          {row.slug || "no address"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.action === "error" ? (
                          <span className="text-gray-400">Nothing — it cannot be used</span>
                        ) : row.action === "create" ? (
                          <span className="font-medium text-green-700">
                            A new product
                          </span>
                        ) : (
                          <span className="font-medium text-brand">It changes</span>
                        )}
                        {row.changes.length > 0 && row.action === "update" && (
                          <ul className="mt-1 space-y-0.5 text-[12px] text-gray-500">
                            {row.changes.map((change) => (
                              <li key={change}>{change}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.errors.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {row.errors.map((err, i) => (
                              <li key={i} className="flex gap-1.5">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                                <span className="text-[12px] text-red-700">
                                  <span className="font-semibold">
                                    {err.column}:
                                  </span>{" "}
                                  {err.message}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* What happened */}
      {done && (
        <section className="rounded-xl border border-green-200 bg-green-50/50 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Check className="h-4 w-4 text-green-600" />
            The import is finished
          </h2>
          <p className="mt-1.5 text-[13px] text-gray-600">
            <span className="font-semibold text-ink">{done.created}</span>{" "}
            {done.created === 1 ? "product was" : "products were"} made,{" "}
            <span className="font-semibold text-ink">{done.updated}</span> were
            changed, and{" "}
            <span className="font-semibold text-ink">{done.skipped}</span> were
            left alone because they could not be used. The rest of the
            catalogue was not touched.
          </p>
        </section>
      )}

      {/* What goes in each column */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-[15px] font-bold text-ink">
          What goes in each column
        </h2>
        <p className="mb-4 text-[12.5px] text-gray-500">
          The template has these columns and nothing else, so it cannot be
          imported by accident. Only the address, the name, the category, the
          price and the MRP are needed; the rest are filled in when they are
          known.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-gray-200 text-[11.5px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Column</th>
                <th className="px-3 py-2 font-semibold">What it is</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {columns.map((column) => (
                <tr key={column.key}>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-ink">{column.key}</span>
                    {column.badge && (
                      <span className="ml-1.5 text-[11px] font-semibold text-gray-500">
                        {column.badge}
                      </span>
                    )}
                    {column.required && !column.badge && (
                      <span className="ml-1.5 text-[11px] font-semibold text-red-600">
                        needed
                      </span>
                    )}
                    {column.adminOnly && (
                      <span className="ml-1.5 text-[11px] font-semibold text-amber-700">
                        administrators only
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{column.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
