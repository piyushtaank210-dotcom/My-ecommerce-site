import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { join, resolve, sep } from "node:path";

/**
 * Where the shop keeps its files.
 *
 * The shop runs in two places, and the two places cannot keep files the
 * same way.
 *
 * On a machine — a laptop, a small server — the files are simply on the
 * disk: a picture in `public/uploads/`, a customer's evidence in
 * `private/returns/`. That is how the shop has always worked, and it
 * still is how it works in development.
 *
 * On a serverless host — Vercel — the disk is read-only. There is one
 * copy of the code and it is the same copy for everybody; the only
 * place a file can be written is a scratch directory that is thrown
 * away when the request ends. A picture written to `public/uploads/`
 * there is not written at all: the write fails, the request fails, and
 * the person in front of the screen is told that the photograph could
 * not be uploaded.
 *
 * So the shop asks this module where to put a file, and this module
 * answers. With `BLOB_READ_WRITE_TOKEN` in the environment it puts them
 * in Vercel Blob; without it, it puts them on the disk. The rest of the
 * shop never has to know which.
 *
 * Two kinds of file are kept, and they are kept apart:
 *
 *   - Public — a product's photographs. These are shown to everybody,
 *     so they are served straight from the store's own domain.
 *   - Private — a customer's evidence for a return or a replacement.
 *     These are nobody's business but the customer who sent them and
 *     the back office, so they are never served straight from a URL;
 *     they are fetched through a route that checks who is asking.
 */

/** Where files are kept. */
export type StorageDriver = "local" | "blob";

/** Whether a file may be shown to everybody, or only to the shop. */
export type ObjectAccess = "public" | "private";

/** The folder a public file lives under, in the store and on the disk. */
export const PUBLIC_FOLDER = "uploads";

/** The folder a private file lives under, in the store and on the disk. */
export const PRIVATE_FOLDER = "returns";

/**
 * Where the shop is keeping its files.
 *
 * `STORAGE_DRIVER` says it outright when it is set — "local" or
 * "blob" — which is what a deployment wants when it has to be told
 * rather than worked out. Without it, the shop uses the store when
 * there are credentials for one and the disk when there are not.
 *
 * A store is used when there is either
 *
 *   - a read-write token for it — `BLOB_READ_WRITE_TOKEN`, and
 *     `EVIDENCE_BLOB_READ_WRITE_TOKEN` for the evidence store; or
 *   - the short-lived credentials Vercel issues to a connected project
 *     — `BLOB_STORE_ID` (and `EVIDENCE_BLOB_STORE_ID`) with
 *     `VERCEL_OIDC_TOKEN`.
 *
 * Both are read-write. The token is the one that is used when it is
 * there, because a token names the store it belongs to; the
 * short-lived credentials are paired with the store's id instead.
 */
export function storageDriver(): StorageDriver {
  const told = (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase();
  if (told === "local" || told === "blob") return told;
  if (publicStoreToken()) return "blob";
  if (storeIdFor("public") && oidcToken()) return "blob";
  return "local";
}

/** Whether the shop is keeping its files in the store. */
export function usingBlob(): boolean {
  return storageDriver() === "blob";
}

/**
 * A value that is really a value.
 *
 * A variable Vercel marks as sensitive comes back from
 * `vercel env pull` as the word "[SENSITIVE]" rather than the secret
 * itself. It is not a credential, and the shop must not treat it as
 * one — otherwise it would try to use it and be refused.
 */
function realValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("[SENSITIVE]")) return undefined;
  return trimmed;
}

/**
 * The token for the store that holds the shop's pictures.
 *
 * These are shown to everybody, so they go in the store anybody can
 * read.
 */
export function publicStoreToken(): string | undefined {
  return realValue(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * The token for the store that holds a customer's evidence.
 *
 * Evidence is private, so it belongs in a store that is private as
 * well. A shop that has made a private store for it says so with
 * `EVIDENCE_BLOB_READ_WRITE_TOKEN`.
 *
 * It does not fall back to the pictures' token: a token names the store
 * it belongs to, so using the pictures' token here would put a
 * customer's photograph of a damaged console into the store that
 * everybody can read.
 */
export function evidenceStoreToken(): string | undefined {
  return realValue(process.env.EVIDENCE_BLOB_READ_WRITE_TOKEN);
}

/**
 * The id of the store that holds the shop's pictures.
 */
export function publicStoreId(): string | undefined {
  return realValue(process.env.BLOB_STORE_ID);
}

/**
 * The id of the store that holds a customer's evidence.
 */
export function evidenceStoreId(): string | undefined {
  return realValue(process.env.EVIDENCE_BLOB_STORE_ID);
}

/**
 * The short-lived credentials Vercel issues to a connected project.
 */
export function oidcToken(): string | undefined {
  return realValue(process.env.VERCEL_OIDC_TOKEN);
}

/**
 * The store a kind of file belongs in.
 */
function storeIdFor(access: ObjectAccess): string | undefined {
  return access === "public" ? publicStoreId() : evidenceStoreId();
}

/**
 * Whether the evidence store is one that only the shop can read.
 *
 * It is private when it is a store of its own — named either by its
 * own token or by its own id — and different from the pictures' store.
 */
export function evidenceIsPrivate(): boolean {
  const ownToken = evidenceStoreToken();
  const ownId = evidenceStoreId();

  if (ownToken) {
    return ownToken !== publicStoreToken() || ownId !== publicStoreId();
  }
  if (ownId) {
    return ownId !== publicStoreId();
  }
  return false;
}

/**
 * How a piece of evidence is kept.
 *
 * A store is either public or private, and a file in it is as private
 * as the store it is in. So evidence kept in the shop's own private
 * store is private, and evidence that has nowhere else to go is in the
 * public store — where the shop still serves it only through the
 * authorised route, and where the address of the file is a name of
 * the shop's own making that nobody can guess.
 *
 * A shop that means its evidence to be private makes a private store
 * for it and says so with `EVIDENCE_BLOB_READ_WRITE_TOKEN` and
 * `EVIDENCE_BLOB_STORE_ID`.
 */
export function evidenceAccess(): ObjectAccess {
  // On the disk the evidence is always private: it lives under private/,
  // where the web server cannot reach it.
  if (!usingBlob()) return "private";
  return evidenceIsPrivate() ? "private" : "public";
}

/**
 * Whether the shop can sign an upload for the browser.
 *
 * The browser sends a file straight to the store when the shop signs
 * the upload for it, and signing needs a read-write token — the
 * short-lived credentials are not enough for it. A shop with only the
 * short-lived credentials has the file sent to the shop instead, which
 * the shop then puts in the store itself.
 */
export function canSignClientUploads(access: ObjectAccess): boolean {
  if (access === "public") return Boolean(publicStoreToken());
  return Boolean(evidenceStoreToken());
}

/**
 * Why files cannot be kept here, when they cannot.
 *
 * A deployment with no store configured cannot write files at all: the
 * disk it has is read-only. The shop says so plainly, because "the
 * photograph could not be uploaded" tells the person in front of the
 * screen nothing at all.
 */
export function storageUnavailableReason(): string | null {
  if (!usingBlob()) {
    const onServerless =
      Boolean(process.env.VERCEL) ||
      Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
      process.cwd().startsWith("/var/task");
    if (onServerless) {
      return (
        "This deployment has nowhere to keep files. Set BLOB_READ_WRITE_TOKEN " +
        "(and EVIDENCE_BLOB_READ_WRITE_TOKEN for a private store) in the " +
        "environment and redeploy."
      );
    }
    return null;
  }
  if (!hasStoreCredentials("public")) {
    return (
      "BLOB_READ_WRITE_TOKEN is not set, so there is no store to keep files in."
    );
  }
  return null;
}

/**
 * Whether the shop has credentials it can reach the store with.
 *
 * Either a read-write token, or the store's id paired with the
 * short-lived credentials Vercel issues to a connected project.
 */
function hasStoreCredentials(access: ObjectAccess): boolean {
  if (access === "public") {
    if (publicStoreToken()) return true;
    return Boolean(publicStoreId() && oidcToken());
  }
  if (evidenceStoreToken()) return true;
  return Boolean(evidenceStoreId() && oidcToken());
}

/**
 * The parts of a key, each made safe to be a path of its own.
 *
 * A key is made of the shop's own words — a folder and a file name —
 * and nothing a browser sends ever becomes one of them. This is the
 * belt to the braces of that: even a key that has been tampered with
 * cannot step outside the store.
 */
function safeParts(key: string): string[] {
  return key
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120));
}

/**
 * The disk calls, reached through a name the bundler cannot follow.
 *
 * A path that is worked out at run time makes the bundler trace the
 * whole project into the deployment — every file, for the sake of a
 * picture that may or may not be there. Each call goes through a
 * function it cannot see into, and the tracing stops.
 */
const makeAt = (path: string) => mkdir(path, { recursive: true });
const writeAt = (path: string, bytes: Buffer) => writeFile(path, bytes);
const readAt = (path: string) => readFile(path);
const removeAt = (path: string) => rm(path, { force: true });
const openAt = (path: string) => createReadStream(path);
const statAt = async (path: string) => {
  const { stat } = await import("node:fs/promises");
  return stat(path);
};
const renameAt = async (from: string, to: string) => {
  const { rename } = await import("node:fs/promises");
  await rename(from, to);
};

/**
 * The path of a key on the disk.
 *
 * Public files are under `public/`, private ones under `private/`. The
 * two are kept apart on purpose: a private file must never be able to
 * be reached by the web server as a static file.
 *
 * The path is worked out at run time, and the bundler cannot follow
 * it — so the whole project is not traced into the deployment for the
 * sake of a file that may or may not be there.
 */
const localPathAt = (key: string, access: ObjectAccess): string => {
  // The paths are worked out at run time, so the bundler is told not to
  // follow them: otherwise it traces the whole project into the
  // deployment for the sake of a file that may or may not be there.
  const root = resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    access === "public" ? "public" : "private"
  );
  const full = resolve(join(/*turbopackIgnore: true*/ root, ...safeParts(key)));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error("That file name does not belong in the store.");
  }
  return full;
};

function localPath(key: string, access: ObjectAccess): string {
  return localPathAt(key, access);
}

/**
 * The URL of a public file on the disk.
 *
 * The same key is the same URL as it has always been, so the pictures
 * that are already in the shop keep working.
 */
function localPublicUrl(key: string): string {
  return `/${safeParts(key).join("/")}`;
}

/**
 * The credentials a store call is made with.
 *
 * A read-write token names the store it belongs to, so it is used on
 * its own when it is there. The short-lived credentials Vercel issues
 * name no store, so they are paired with the store's id.
 *
 * The evidence store is never reached with the pictures' credentials:
 * a customer's evidence belongs in the store the shop made for it.
 */
function credentialsFor(access: ObjectAccess): {
  token?: string;
  storeId?: string;
  oidcToken?: string;
} {
  const token =
    access === "public" ? publicStoreToken() : evidenceStoreToken();
  if (token) return { token };

  const storeId = storeIdFor(access);
  const oidc = oidcToken();
  if (storeId && oidc) return { storeId, oidcToken: oidc };

  // Nothing of its own: the pictures' token is the last resort, and
  // only for the pictures themselves.
  if (access === "public" && publicStoreToken()) {
    return { token: publicStoreToken() };
  }
  return {};
}

/** The result of a write. */
export type PutResult =
  | {
      ok: true;
      /** Where the file can be fetched from, when it may be fetched at all. */
      url: string | null;
      /** The key it was written under. */
      key: string;
    }
  | { ok: false; reason: string };

/**
 * Writes a file.
 *
 * The name is the shop's own: the key is made of the folder it belongs
 * in and a name of our own making, and the name that came with the
 * upload is never used as a path.
 */
export async function putObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  access: ObjectAccess;
}): Promise<PutResult> {
  const unavailable = storageUnavailableReason();
  if (unavailable) return { ok: false, reason: unavailable };

  if (!usingBlob()) {
    const full = localPath(input.key, input.access);
    try {
      await makeAt(resolve(full, ".."));
      await writeAt(full, input.body);
    } catch (err) {
      return {
        ok: false,
        reason:
          err instanceof Error
            ? `The file could not be saved: ${err.message}`
            : "The file could not be saved.",
      };
    }
    return {
      ok: true,
      url: input.access === "public" ? localPublicUrl(input.key) : null,
      key: input.key,
    };
  }

  try {
    const { put } = await import("@vercel/blob");
    const blob = await put(input.key, input.body, {
      access: input.access,
      contentType: input.contentType,
      ...credentialsFor(input.access),
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { ok: true, url: blob.url, key: blob.pathname };
  } catch (err) {
    return {
      ok: false,
      reason: blobErrorMessage(err, "The file could not be saved."),
    };
  }
}

/**
 * What the store says about a file.
 */
export type ObjectInfo = {
  /** How big it is. */
  sizeBytes: number;
  /** What the store thinks it is. */
  contentType: string | null;
  /** The key it is under. */
  key: string;
  /** The URL it can be fetched from, when it may be fetched at all. */
  url: string | null;
};

/**
 * Asks the store about a file without fetching it.
 *
 * This is how the shop checks that a file the browser says it uploaded
 * is really there before it writes a row for it.
 */
export async function headObject(
  key: string,
  access: ObjectAccess
): Promise<ObjectInfo | null> {
  if (!usingBlob()) {
    try {
      // The size of the file, without reading the whole of it.
      const info = await statAt(localPath(key, access));
      return {
        sizeBytes: info.size,
        contentType: null,
        key,
        url: access === "public" ? localPublicUrl(key) : null,
      };
    } catch {
      return null;
    }
  }

  try {
    const { head } = await import("@vercel/blob");
    const result = await head(key, { ...credentialsFor(access) });
    return {
      sizeBytes: result.size,
      contentType: result.contentType ?? null,
      key: result.pathname,
      url: result.url,
    };
  } catch {
    return null;
  }
}

/**
 * Reads a file.
 *
 * On the disk it is read into memory, which is what a picture wants.
 * In the store it comes back as a stream, so a video does not have to
 * be held in memory all at once.
 */
export async function getObject(
  key: string,
  access: ObjectAccess
): Promise<Buffer | null> {
  const stream = await getObjectStream(key, access);
  if (!stream) return null;
  const chunks: Uint8Array[] = [];
  const reader = stream.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

/**
 * Reads a file as a stream.
 */
export async function getObjectStream(
  key: string,
  access: ObjectAccess
): Promise<{
  stream: ReadableStream<Uint8Array>;
  sizeBytes: number | null;
  contentType: string | null;
} | null> {
  if (!usingBlob()) {
    try {
      const full = localPath(key, access);
      const stat = await import("node:fs/promises").then((fs) => fs.stat(full));
      const node = openAt(full);
      const web = Readable.toWeb(node) as ReadableStream<Uint8Array>;
      return { stream: web, sizeBytes: stat.size, contentType: null };
    } catch {
      return null;
    }
  }

  try {
    const { get } = await import("@vercel/blob");
    const result = await get(key, {
      access,
      ...credentialsFor(access),
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return {
      stream: result.stream as ReadableStream<Uint8Array>,
      sizeBytes: result.blob.size ?? null,
      contentType: result.blob.contentType ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * The first few bytes of a file.
 *
 * It is how the shop checks what a file really is when the browser has
 * already sent it on its own: the name it arrived with says nothing,
 * but the bytes do. When the store cannot give them — because it will
 * not serve a range, or because there is no store — the shop falls
 * back to what the store recorded about the file.
 */
export async function headBytes(
  key: string,
  access: ObjectAccess,
  length = 64
): Promise<Uint8Array | null> {
  if (!usingBlob()) {
    try {
      const { open } = await import("node:fs/promises");
      const handle = await open(localPath(key, access), "r");
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return new Uint8Array(buffer.subarray(0, bytesRead));
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  try {
    const { get } = await import("@vercel/blob");
    const result = await get(key, {
      access,
      ...credentialsFor(access),
      headers: { range: `bytes=0-${length - 1}` },
    });
    if (!result || !result.stream) return null;
    const reader = result.stream.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    while (total < length) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      parts.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      out.set(part.subarray(0, Math.max(0, length - at)), at);
      at += part.length;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Removes a file.
 *
 * A file that is not there is not a problem: it is gone, which is what
 * was asked for.
 */
export async function deleteObject(
  key: string,
  access: ObjectAccess
): Promise<void> {
  if (!usingBlob()) {
    try {
      await removeAt(localPath(key, access));
    } catch {
      // The file is already gone.
    }
    return;
  }
  try {
    const { del } = await import("@vercel/blob");
    await del(key, { ...credentialsFor(access) });
  } catch {
    // The file is already gone.
  }
}

/**
 * Moves a file from one key to another.
 *
 * On the disk it is a rename. In the store there is no rename, so the
 * file is copied and the old one is removed.
 */
export async function moveObject(
  fromKey: string,
  toKey: string,
  access: ObjectAccess
): Promise<boolean> {
  if (!usingBlob()) {
    try {
      const from = localPath(fromKey, access);
      const to = localPath(toKey, access);
      await makeAt(resolve(to, ".."));
      await renameAt(from, to);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const { copy, del } = await import("@vercel/blob");
    await copy(fromKey, toKey, {
      access,
      ...credentialsFor(access),
      allowOverwrite: true,
    });
    await del(fromKey, { ...credentialsFor(access) }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * The files under a folder.
 *
 * It is what the sweeps use to find evidence nobody claimed. On the
 * disk it is a directory listing; in the store it is the store's own
 * listing.
 */
export async function listObjects(
  prefix: string,
  access: ObjectAccess
): Promise<{ key: string; sizeBytes: number; uploadedAt: number }[]> {
  if (!usingBlob()) {
    try {
      const { readdir, stat } = await import("node:fs/promises");
      const root = localPath(prefix, access);
      const entries = await readdir(root, { withFileTypes: true });
      const out: { key: string; sizeBytes: number; uploadedAt: number }[] = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const full = join(root, entry.name);
        const info = await stat(full).catch(() => null);
        out.push({
          key: `${prefix.replace(/\/+$/, "")}/${entry.name}`,
          sizeBytes: info?.size ?? 0,
          uploadedAt: info?.mtimeMs ?? Date.now(),
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  try {
    const { list } = await import("@vercel/blob");
    const out: { key: string; sizeBytes: number; uploadedAt: number }[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await list({
        prefix,
        limit: 1000,
        cursor,
        ...credentialsFor(access),
      });
      for (const blob of page.blobs) {
        out.push({
          key: blob.pathname,
          sizeBytes: blob.size,
          uploadedAt: blob.uploadedAt ? blob.uploadedAt.getTime() : Date.now(),
        });
      }
      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Whether a stored path is one of the store's own addresses.
 */
export function isBlobUrl(path: string): boolean {
  return /^https:\/\/[^/]+\.(public|private)\.blob\.vercel-storage\.com\//i.test(
    path
  );
}

/**
 * The key a store address stands for.
 *
 * A file in the store is found by its key, and its address is the key
 * with the store's own domain in front of it.
 */
export function keyFromBlobUrl(url: string): string | null {
  if (!isBlobUrl(url)) return null;
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

/**
 * What went wrong, in words a person can act on.
 *
 * The store's own messages are kept where they say something useful,
 * and everything else is turned into something plain. A secret is never
 * part of the answer.
 */
function blobErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message ?? "");
    if (message) {
      // A token must never appear in a message that reaches a browser.
      const cleaned = message.replace(/vercel_blob_rw_[A-Za-z0-9_-]+/g, "…");
      return cleaned;
    }
  }
  return fallback;
}
