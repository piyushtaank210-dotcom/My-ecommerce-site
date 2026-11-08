import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { fail, json, requireApiPermission } from "@/lib/api";
import {
  addProductImage,
  listProductGallery,
  removeProductImage,
  reorderProductImages,
  setMainProductImage,
  setProductImageAlt,
} from "@/lib/admin";
import { saveUpload, isOwnUpload } from "@/lib/uploads";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/admin/products/[slug]/images — the product's photographs.
 */
export async function GET(_request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.view");
  if ("error" in guard) return guard.error;

  const { slug } = await params;
  return json({ images: (await listProductGallery(slug)) });
}

/**
 * POST /api/admin/products/[slug]/images — upload photographs.
 *
 * The body is a form: one or more files under `files`, and optionally the
 * id of the picture being replaced under `replaceId`.
 *
 * The file is written to public/uploads/<slug>/ with a name of our own
 * making. The name that came with the upload is never used as a path, so
 * nothing a browser sends can decide where a file lands.
 */
export async function POST(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Send the photographs as a form.", 400);
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!files.length) return fail("Choose at least one photograph.", 400);

  const replaceId = String(formData.get("replaceId") ?? "").trim();

  const dir = slug;

  const added: string[] = [];

  for (const file of files) {
    const saved = await saveUpload(dir, file);
    if (!saved.ok) return fail(saved.reason, 415);

    const publicPath = saved.path;
    const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

    if (replaceId) {
      const old = (await removeProductImage(slug, replaceId));
      // The file the old picture used is ours, so it goes too — but only
      // if it is this product's own.
      if (old.removed && old.path && isOwnUpload(old.path, slug)) {
        await unlink(join(process.cwd(), "public", old.path)).catch(() => {});
      }
    }

    const image = (await addProductImage(slug, publicPath, alt || null));
    if (image) added.push(image.id);
  }

  return json({ images: (await listProductGallery(slug)), added });
}

/**
 * PATCH /api/admin/products/[slug]/images — what to do with the pictures.
 *
 *   { "action": "reorder", "ids": ["a", "b"] }
 *   { "action": "main", "id": "a" }
 *   { "action": "alt", "id": "a", "alt": "…" }
 *   { "action": "remove", "id": "a" }
 */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiPermission("catalog.manage");
  if ("error" in guard) return guard.error;

  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const action = String(body.action ?? "");
  const id = String(body.id ?? "");

  if (action === "reorder") {
    const ids = Array.isArray(body.ids)
      ? body.ids.map((i) => String(i))
      : [];
    if (!ids.length) return fail("Nothing to reorder.", 400);
    (await reorderProductImages(slug, ids));
    return json({ images: (await listProductGallery(slug)) });
  }

  if (action === "main") {
    if (!id) return fail("Choose a photograph.", 400);
    if (!(await setMainProductImage(slug, id))) {
      return fail("That photograph is not on this product.", 404);
    }
    return json({ images: (await listProductGallery(slug)) });
  }

  if (action === "alt") {
    if (!id) return fail("Choose a photograph.", 400);
    if (!(await setProductImageAlt(slug, id, String(body.alt ?? "")))) {
      return fail("That photograph is not on this product.", 404);
    }
    return json({ images: (await listProductGallery(slug)) });
  }

  if (action === "remove") {
    if (!id) return fail("Choose a photograph.", 400);
    const result = (await removeProductImage(slug, id));
    if (!result.removed) {
      return fail("That photograph is not on this product.", 404);
    }
    // Only the product's own photographs are deleted from disk. A copy
    // carries the original's pictures — their paths are the original's — and
    // removing one from the copy must not take it off the original.
    if (result.path && isOwnUpload(result.path, slug)) {
      await unlink(join(process.cwd(), "public", result.path)).catch(() => {});
    }
    return json({ images: (await listProductGallery(slug)) });
  }

  return fail("That is not something a photograph can do.", 400);
}
