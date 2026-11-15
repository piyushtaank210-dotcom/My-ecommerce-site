import { NextResponse } from "next/server";
import { fail, json, requireApiPermission } from "@/lib/api";
import {
  addProductImage,
  getVariant,
  listProductGallery,
  removeProductImage,
  updateVariant,
} from "@/lib/admin";
import { getDb } from "@/lib/db";
import {
  deleteUploadIfUnreferenced,
  productImageFolder,
  safeSegment,
  uploadName,
  variantImageFolder,
} from "@/lib/uploads";
import { extensionFor, sniffFileType } from "@/lib/file-types";
import {
  canSignClientUploads,
  headBytes,
  headObject,
  publicStoreToken,
  storageUnavailableReason,
  usingBlob,
} from "@/lib/storage";
import { extensionForType, limitsFor, type UploadTarget } from "@/lib/upload-tickets";

/**
 * The back office's uploads.
 *
 * A photograph the shop is running on a machine is sent to the shop
 * itself, which writes it down. A photograph on a serverless
 * deployment cannot be: the shop's disk there cannot be written to, and
 * the request that carries the file is itself too small for a video.
 *
 * So the shop asks this route what to do with a file, and this route
 * answers in one of two ways:
 *
 *   - "app" — send the file to the shop, which will keep it. This is
 *     what happens on a machine.
 *   - "direct" — send the file to the shop's store yourself. The shop
 *     signs the upload and says where to put it; the file never passes
 *     through the shop, so it can be as big as the store allows.
 *
 * Either way the shop is told which files arrived, and it writes the
 * row for them only once the file is really there.
 */

type TicketFile = { name: string; type: string; size: number };
type CommittedFile = {
  pathname: string;
  url: string;
  name: string;
  type: string;
  size: number;
  alt?: string;
};

export async function POST(request: Request) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  // The store's own request for a signed upload. It arrives with its
  // own shape, so it is recognised first.
  if (body.type === "blob.generate-client-token") {
    return signUpload(request, body);
  }

  const phase = String(body.phase ?? "");
  const target = String(body.target ?? "") as UploadTarget;
  const slug = String(body.slug ?? "").trim();

  if (target !== "product-images" && target !== "variant-image") {
    return fail("That is not something the shop can be sent a file for.", 400);
  }
  if (!slug) return fail("Which product?", 400);

  const variantId =
    target === "variant-image" ? String(body.variantId ?? "").trim() : "";
  if (target === "variant-image" && !variantId) {
    return fail("Which option?", 400);
  }

  if (!(await productExists(slug))) {
    return fail("That product does not exist.", 404);
  }
  if (target === "variant-image" && !(await getVariant(slug, variantId))) {
    return fail("No such option.", 404);
  }

  if (phase === "ticket") return ticket(body, target, slug, variantId);
  if (phase === "commit") {
    return commit(body, target, slug, variantId, guard.user.id);
  }

  return fail("That is not something the shop can be asked to do.", 400);
}

/**
 * Whether a product is there.
 */
async function productExists(slug: string): Promise<boolean> {
  const row = await getDb()
    .prepare("SELECT slug FROM products WHERE slug = ?")
    .get(slug);
  return Boolean(row);
}

/**
 * The folder a target's files go in.
 */
function folderFor(target: UploadTarget, slug: string, variantId: string): string {
  return target === "variant-image"
    ? variantImageFolder(slug)
    : productImageFolder(slug);
}

/**
 * Where the file goes when the shop keeps it itself.
 */
function endpointFor(
  target: UploadTarget,
  slug: string,
  variantId: string
): string {
  return target === "variant-image"
    ? `/api/admin/products/${encodeURIComponent(slug)}/variants/${encodeURIComponent(variantId)}/image`
    : `/api/admin/products/${encodeURIComponent(slug)}/images`;
}

/**
 * The extensions a target's files may end in.
 */
function allowedExtensions(target: UploadTarget): string[] {
  const limits = limitsFor(target);
  return limits.contentTypes
    .map((type) => extensionForType(type))
    .filter((ext): ext is string => Boolean(ext));
}

/**
 * The first half of an upload: where the files should go.
 */
async function ticket(
  body: Record<string, unknown>,
  target: UploadTarget,
  slug: string,
  variantId: string
) {
  const unavailable = storageUnavailableReason();
  if (unavailable) return fail(unavailable, 503);

  const limits = limitsFor(target);
  const files = Array.isArray(body.files) ? (body.files as TicketFile[]) : [];

  if (!files.length) return fail("Choose at least one photograph.", 400);
  if (files.length > limits.maxFiles) {
    return fail(
      `Choose at most ${limits.maxFiles} photographs at a time.`,
      400
    );
  }

  const folder = folderFor(target, slug, variantId);

  // On a machine the shop keeps the file itself, so the browser sends
  // it straight to the route that writes the row down.
  if (!usingBlob() || !canSignClientUploads("public")) {
    return json({
      mode: "app",
      endpoint: endpointFor(target, slug, variantId),
    });
  }

  const uploads: {
    index: number;
    pathname: string;
    name: string;
    type: string;
    size: number;
  }[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const name = String(file?.name ?? "").trim();
    const type = String(file?.type ?? "").trim();
    const size = Number(file?.size ?? 0);

    if (!limits.contentTypes.includes(type)) {
      return fail(
        `"${name || "That file"}" is not a photograph. Use a JPEG, PNG, WebP, GIF or AVIF file.`,
        415
      );
    }
    if (!Number.isFinite(size) || size <= 0) {
      return fail(`"${name || "That file"}" is empty.`, 400);
    }
    if (size > limits.maxBytes) {
      const mb = Math.round(limits.maxBytes / (1024 * 1024));
      return fail(`"${name}" is over ${mb}MB. Please send a smaller file.`, 413);
    }

    const ext = extensionForType(type);
    if (!ext) return fail(`"${name}" is not a photograph.`, 415);

    uploads.push({
      index,
      pathname: `${folder}/${uploadName(ext)}`,
      name: name || `photograph${ext}`,
      type,
      size,
    });
  }

  return json({
    mode: "direct",
    access: "public",
    tokenUrl: "/api/admin/uploads",
    uploads,
  });
}

/**
 * The store's request for a signed upload.
 *
 * The shop checks the place the file is going before it signs it: the
 * file must be going into a product's own folder, and the person
 * asking must be allowed to put files there.
 */
async function signUpload(request: Request, body: Record<string, unknown>) {
  const unavailable = storageUnavailableReason();
  if (unavailable) return fail(unavailable, 503);

  const payload = (body.payload ?? {}) as Record<string, unknown>;
  const pathname = String(payload.pathname ?? "");
  const clientPayload = String(payload.clientPayload ?? "");

  let target: UploadTarget = "product-images";
  let slug = "";
  let variantId = "";

  try {
    const parsed = JSON.parse(clientPayload) as Record<string, unknown>;
    target = String(parsed.target ?? "") as UploadTarget;
    slug = String(parsed.slug ?? "").trim();
    variantId = String(parsed.variantId ?? "").trim();
  } catch {
    return fail("That upload was not asked for properly.", 400);
  }

  if (target !== "product-images" && target !== "variant-image") {
    return fail("That is not something the shop can be sent a file for.", 400);
  }
  if (!slug || !(await productExists(slug))) {
    return fail("That product does not exist.", 404);
  }
  if (target === "variant-image" && !(await getVariant(slug, variantId))) {
    return fail("No such option.", 404);
  }

  // The file must be going into the folder the ticket named, and
  // nowhere else.
  const folder = folderFor(target, slug, variantId);
  if (!pathname.startsWith(`${folder}/`) || pathname.includes("..")) {
    return fail("That file was not asked for properly.", 400);
  }

  const ext = pathname.slice(pathname.lastIndexOf("."));
  if (!allowedExtensions(target).includes(ext)) {
    return fail("That file was not asked for properly.", 400);
  }
  const limits = limitsFor(target);

  try {
    const { handleUpload } = await import("@vercel/blob/client");
    const result = await handleUpload({
      // The photographs are signed with the pictures' own token, so they
      // land in the store the shop made for them.
      token: publicStoreToken(),
      body: body as never,
      request,
      onBeforeGenerateToken: async (asked) => {
        if (asked !== pathname) {
          throw new Error("That file was not asked for properly.");
        }
        return {
          allowedContentTypes: limits.contentTypes,
          maximumSizeInBytes: limits.maxBytes,
          validUntil: Date.now() + 10 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return fail(
      err instanceof Error
        ? err.message
        : "The upload could not be signed for.",
      400
    );
  }
}

/**
 * The second half of an upload: the files have arrived.
 *
 * The shop checks each file is really there before it writes a row for
 * it, and it checks what the file really is from its own bytes.
 */
async function commit(
  body: Record<string, unknown>,
  target: UploadTarget,
  slug: string,
  variantId: string,
  userId: number | null
) {
  const uploads = Array.isArray(body.uploads)
    ? (body.uploads as CommittedFile[])
    : [];
  if (!uploads.length) return fail("No files were sent.", 400);

  const folder = folderFor(target, slug, variantId);
  let replaceId = String(body.replaceId ?? "").trim();

  const added: string[] = [];

  // An option has one photograph of its own, so only one file is
  // taken for it.
  if (target === "variant-image" && uploads.length > 1) {
    return fail("An option has one photograph. Send one file.", 400);
  }

  for (const upload of uploads) {
    const pathname = String(upload?.pathname ?? "");
    if (!pathname.startsWith(`${folder}/`) || pathname.includes("..")) {
      return fail("That file was not sent to the right place.", 400);
    }

    const info = await headObject(pathname, "public");
    if (!info) {
      return fail("One of the photographs did not arrive. Please try again.", 502);
    }

    // What the file really is, read from its own bytes. The name it
    // arrived with says nothing; the bytes do.
    const bytes = await headBytes(pathname, "public");
    const sniffed = bytes ? sniffFileType(bytes) : null;
    if (sniffed && !extensionFor(sniffed)) {
      return fail("One of the photographs is not a photograph.", 415);
    }
    if (sniffed && sniffed !== upload.type && upload.type) {
      // The file is not what it said it was. It is refused rather than
      // stored under the wrong name.
      const ext = extensionFor(sniffed);
      if (!ext || !pathname.endsWith(ext)) {
        return fail("One of the photographs is not what it said it was.", 415);
      }
    }

    const url = info.url ?? String(upload.url ?? "");
    if (!url) return fail("One of the photographs did not arrive.", 502);

    if (target === "variant-image") {
      const result = await updateVariant(
        slug,
        variantId,
        { image: url },
        userId
      );
      if (!result.ok) {
        return fail(result.reason ?? "That option could not be changed.", 409);
      }
      // The same shape the route that keeps the file itself answers
      // with, so the page does not have to know which way the file
      // travelled.
      return json(result.variant ?? { ok: true });
    }

    // What the photograph shows is taken from the name the file
    // arrived with, the same way the route that keeps the file itself
    // does it.
    const alt = String(upload?.alt ?? upload?.name ?? "")
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim()
      .slice(0, 200);

    // The new photograph is added first, so that the product is never
    // left without one — not even for the moment it takes to write the
    // row down.
    const image = await addProductImage(slug, url, alt || null);
    if (image) added.push(image.id);

    if (replaceId) {
      const old = await removeProductImage(slug, replaceId);
      // The file the old picture used is ours, so it goes too — but
      // only if it is this product's own and nothing else wants it.
      if (old.removed && old.path) {
        await deleteUploadIfUnreferenced(old.path, slug);
      }
      // A replacement is carried out once, by the first file. The rest
      // are added beside the photograph that replaced the old one.
      replaceId = "";
    }
  }

  if (target === "variant-image") {
    return json({ ok: true, images: await listProductGallery(slug), added });
  }
  return json({ images: await listProductGallery(slug), added });
}
