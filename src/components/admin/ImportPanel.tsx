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
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div className="min-w-0">
            <h2 className="admin-panel-title">
              <FileSpreadsheet className="h-4 w-4 text-brand" />
              Import and export
            </h2>
            <p className="admin-panel-sub">
              Take the catalogue out as a spreadsheet, change it, and bring it
              back. An import only ever touches the products in the file — the
              rest of the catalogue is left exactly as it is.
            </p>
          </div>
        </div>
        <div className="admin-panel-body">
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
            className="admin-notice admin-notice--bad mt-4"
          >
            {error}
          </p>
        )}
        </div>
      </section>

      {/* The preview */}
      {preview && (
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div className="min-w-0">
              <h2 className="admin-panel-title">What the file would do</h2>
              <p className="admin-panel-sub">
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
        <div className="admin-panel-body">
          {preview.missingColumns.length > 0 && (
            <p className="admin-notice admin-notice--warn mb-3">
              <span>
                The file is missing{" "}
                <span className="font-semibold">{preview.missingColumns.join(", ")}</span>
                , so every row will be refused.
              </span>
            </p>
          )}
          {preview.unknownColumns.length > 0 && (
            <p className="admin-notice mb-3">
              <span>
                The file has columns that are not read:{" "}
                <span className="font-semibold">{preview.unknownColumns.join(", ")}</span>
                . They are left out rather than guessed at.
              </span>
            </p>
          )}

          <div className="mb-4 flex flex-wrap gap-2 text-[12.5px]">
            <span className="admin-badge admin-badge--good">
              {preview.summary.created} to make
            </span>
            <span className="admin-badge admin-badge--accent">
              {preview.summary.updated} to change
            </span>
            {preview.summary.errors > 0 && (
              <span className="admin-badge admin-badge--bad">
                {preview.summary.errors} that cannot be used
              </span>
            )}
          </div>

          {preview.rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-gray-500">
              The file has no rows in it.
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th className="admin-th-num">Row</th>
                    <th>Product</th>
                    <th>What will happen</th>
                    <th>Problems</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row: ImportRow) => (
                    <tr key={row.row}>
                      <td className="admin-td-num text-gray-500">{row.row}</td>
                      <td>
                        <span className="admin-cell-title">{row.name || "—"}</span>
                        <span className="admin-cell-sub">
                          {row.slug || "no address"}
                        </span>
                      </td>
                      <td>
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
                      <td>
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
        </div>
        </section>
      )}

      {/* What happened */}
      {done && (
        <section className="admin-panel admin-panel--good">
          <div className="admin-panel-head admin-panel-head--plain">
            <div className="min-w-0">
              <h2 className="admin-panel-title">
                <Check className="h-4 w-4 text-green-600" />
                The import is finished
              </h2>
              <p className="admin-panel-sub">
                <span className="font-semibold text-ink">{done.created}</span>{" "}
                {done.created === 1 ? "product was" : "products were"} made,{" "}
                <span className="font-semibold text-ink">{done.updated}</span> were
                changed, and{" "}
                <span className="font-semibold text-ink">{done.skipped}</span> were
                left alone because they could not be used. The rest of the
                catalogue was not touched.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* What goes in each column */}
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div className="min-w-0">
            <h2 className="admin-panel-title">What goes in each column</h2>
            <p className="admin-panel-sub">
              The template has these columns and nothing else, so it cannot be
              imported by accident. Only the address, the name, the category,
              the price and the MRP are needed; the rest are filled in when
              they are known.
            </p>
          </div>
        </div>
        <div className="admin-panel-body admin-panel-body--flush">
        <div className="admin-table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="admin-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Column</th>
                <th>What it is</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.key}>
                  <td>
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
                  <td className="text-gray-600">{column.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </section>
    </div>
  );
}
