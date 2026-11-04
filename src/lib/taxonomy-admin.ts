import { getDb } from "./db";
import { cleanSpecFields } from "./taxonomy";

/**
 * The shape of the catalogue: categories, the categories inside them, and
 * the brands the store sells.
 *
 * A category that a product is in cannot be removed — the products would
 * be left pointing at nothing. The same goes for a subcategory or a brand
 * that something still uses. Renaming one is allowed, and the products
 * that carry it follow, so the catalogue never says two different things
 * about the same thing.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number => Number(v ?? 0);
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** The name an address is made from. */
function slugify(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------- categories */

export type CategoryDetail = {
  slug: string;
  name: string;
  icon: string | null;
  blurb: string | null;
  specFields: string[];
  position: number;
  /** How many products are in it. */
  productCount: number;
  subcategories: {
    slug: string;
    name: string;
    position: number;
    productCount: number;
  }[];
};

export type CategoryInput = {
  name?: string;
  blurb?: string | null;
  icon?: string | null;
  specFields?: string[];
};

export type TaxonomyResult = {
  ok: boolean;
  /** The address of the thing that was made. */
  slug?: string;
  reason?: string;
  field?: string;
};

/** Every category, with its subcategories and how many products use them. */
export function listCategories(): CategoryDetail[] {
  const db = getDb();

  const categories = db
    .prepare("SELECT * FROM categories ORDER BY position, name")
    .all() as Row[];

  const subcategories = db
    .prepare("SELECT * FROM subcategories ORDER BY position, name")
    .all() as Row[];

  const productCounts = new Map<string, number>();
  for (const r of db
    .prepare(
      "SELECT category_slug, COUNT(*) AS n FROM products GROUP BY category_slug"
    )
    .all() as { category_slug: string | null; n: number }[]) {
    if (r.category_slug) productCounts.set(r.category_slug, r.n);
  }

  const subCounts = new Map<string, number>();
  for (const r of db
    .prepare(
      "SELECT subcategory, COUNT(*) AS n FROM products WHERE subcategory IS NOT NULL GROUP BY subcategory"
    )
    .all() as { subcategory: string | null; n: number }[]) {
    if (r.subcategory) subCounts.set(r.subcategory, r.n);
  }

  return categories.map((c) => {
    const slug = str(c.slug);
    return {
      slug,
      name: str(c.name),
      icon: strOrNull(c.icon),
      blurb: strOrNull(c.blurb),
      specFields: parseFields(c.spec_fields),
      position: num(c.position),
      productCount: productCounts.get(slug) ?? 0,
      subcategories: subcategories
        .filter((s) => str(s.category_slug) === slug)
        .map((s) => ({
          slug: str(s.slug),
          name: str(s.name),
          position: num(s.position),
          productCount: subCounts.get(str(s.name)) ?? 0,
        })),
    };
  });
}

/** The specification fields a category asks about. */
function parseFields(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? cleanSpecFields(parsed) : [];
  } catch {
    return [];
  }
}

/**
 * Adds a category.
 *
 * The address is worked out from the name, so a category called "Gaming
 * Accessories" is found at `/category/gaming-accessories`.
 */
export function createCategory(input: {
  slug?: string;
  name: string;
  blurb?: string | null;
  icon?: string | null;
  specFields?: string[];
}): TaxonomyResult {
  const db = getDb();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, reason: "Give the category a name." };

  let slug = slugify(input.slug || name);
  if (slug.length < 2) {
    return { ok: false, reason: "Give the category a name." };
  }
  if (db.prepare("SELECT slug FROM categories WHERE slug = ?").get(slug)) {
    return {
      ok: false,
      reason: "There is already a category at that address.",
      field: "slug",
    };
  }

  const position = num(
    (
      db
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM categories")
        .get() as { n: number }
    ).n
  );

  db.prepare(
    `INSERT INTO categories (slug, name, icon, blurb, spec_fields, position)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    slug,
    name,
    input.icon?.trim() || null,
    input.blurb?.trim() || null,
    JSON.stringify(cleanSpecFields(input.specFields ?? [])),
    position
  );

  return { ok: true, slug };
}

/** Changes a category — its name, its blurb and the fields it asks about. */
export function updateCategory(
  slug: string,
  input: CategoryInput
): TaxonomyResult {
  const db = getDb();
  const existing = db
    .prepare("SELECT slug FROM categories WHERE slug = ?")
    .get(slug);
  if (!existing) return { ok: false, reason: "That category no longer exists." };

  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) {
      return { ok: false, reason: "Give the category a name.", field: "name" };
    }
    sets.push("name = ?");
    params.push(name);
  }
  if (input.blurb !== undefined) {
    sets.push("blurb = ?");
    params.push(input.blurb?.trim() || null);
  }
  if (input.icon !== undefined) {
    sets.push("icon = ?");
    params.push(input.icon?.trim() || null);
  }
  if (input.specFields !== undefined) {
    sets.push("spec_fields = ?");
    params.push(JSON.stringify(cleanSpecFields(input.specFields)));
  }

  if (!sets.length) return { ok: true };

  params.push(slug);
  db.prepare(`UPDATE categories SET ${sets.join(", ")} WHERE slug = ?`).run(
    ...params
  );
  return { ok: true };
}

/**
 * Removes a category.
 *
 * A category that products are in cannot be removed — the products would be
 * left pointing at nothing. A category with subcategories cannot either.
 */
export function deleteCategory(slug: string): TaxonomyResult {
  const db = getDb();

  const existing = db
    .prepare("SELECT slug FROM categories WHERE slug = ?")
    .get(slug);
  if (!existing) return { ok: false, reason: "That category no longer exists." };

  const products = num(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM products WHERE category_slug = ?")
        .get(slug) as { n: number }
    ).n
  );
  if (products > 0) {
    return {
      ok: false,
      reason: `${products} product${products === 1 ? " is" : "s are"} in this category. Move them first.`,
    };
  }

  const subcategories = num(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM subcategories WHERE category_slug = ?")
        .get(slug) as { n: number }
    ).n
  );
  if (subcategories > 0) {
    return {
      ok: false,
      reason: `This category has ${subcategories} subcategor${
        subcategories === 1 ? "y" : "ies"
      }. Remove them first.`,
    };
  }

  db.prepare("DELETE FROM categories WHERE slug = ?").run(slug);
  return { ok: true };
}

/* ---------------------------------------------------------- subcategories */

/**
 * Adds a category inside a category.
 *
 * The name is what a product carries, so two categories may each have a
 * "PS5" of their own without the two colliding.
 */
export function createSubcategory(
  categorySlug: string,
  name: string
): TaxonomyResult {
  const db = getDb();
  const category = db
    .prepare("SELECT slug FROM categories WHERE slug = ?")
    .get(categorySlug);
  if (!category) return { ok: false, reason: "That category no longer exists." };

  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return { ok: false, reason: "Give the subcategory a name.", field: "name" };
  }

  const existing = db
    .prepare(
      "SELECT slug FROM subcategories WHERE category_slug = ? AND name = ? COLLATE NOCASE"
    )
    .get(categorySlug, trimmed);
  if (existing) {
    return {
      ok: false,
      reason: "This category already has that subcategory.",
      field: "name",
    };
  }

  let slug = slugify(trimmed);
  if (!slug) return { ok: false, reason: "Give the subcategory a name." };
  let n = 2;
  while (
    db.prepare("SELECT slug FROM subcategories WHERE slug = ?").get(slug)
  ) {
    slug = `${slugify(trimmed)}-${n}`;
    n++;
  }

  const position = num(
    (
      db
        .prepare(
          "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM subcategories WHERE category_slug = ?"
        )
        .get(categorySlug) as { n: number }
    ).n
  );

  db.prepare(
    "INSERT INTO subcategories (slug, category_slug, name, position) VALUES (?, ?, ?, ?)"
  ).run(slug, categorySlug, trimmed, position);

  return { ok: true };
}

/**
 * Renames a subcategory.
 *
 * The products that carry it follow, so the catalogue keeps saying one
 * thing about it.
 */
export function updateSubcategory(
  categorySlug: string,
  subSlug: string,
  name: string
): TaxonomyResult {
  const db = getDb();

  const existing = db
    .prepare(
      "SELECT slug, name FROM subcategories WHERE slug = ? AND category_slug = ?"
    )
    .get(subSlug, categorySlug) as Row | undefined;
  if (!existing) {
    return { ok: false, reason: "That subcategory no longer exists." };
  }

  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return { ok: false, reason: "Give the subcategory a name.", field: "name" };
  }

  const clash = db
    .prepare(
      "SELECT slug FROM subcategories WHERE category_slug = ? AND name = ? COLLATE NOCASE AND slug != ?"
    )
    .get(categorySlug, trimmed, subSlug);
  if (clash) {
    return {
      ok: false,
      reason: "This category already has that subcategory.",
      field: "name",
    };
  }

  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE subcategories SET name = ? WHERE slug = ? AND category_slug = ?"
    ).run(trimmed, subSlug, categorySlug);
    // The products that carry it follow the new name.
    db.prepare("UPDATE products SET subcategory = ? WHERE subcategory = ?").run(
      trimmed,
      str(existing.name)
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { ok: true };
}

/** Removes a subcategory. One that products still carry cannot be. */
export function deleteSubcategory(
  categorySlug: string,
  subSlug: string
): TaxonomyResult {
  const db = getDb();

  const existing = db
    .prepare(
      "SELECT slug, name FROM subcategories WHERE slug = ? AND category_slug = ?"
    )
    .get(subSlug, categorySlug) as Row | undefined;
  if (!existing) {
    return { ok: false, reason: "That subcategory no longer exists." };
  }

  const products = num(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM products WHERE subcategory = ? COLLATE NOCASE"
        )
        .get(str(existing.name)) as { n: number }
    ).n
  );
  if (products > 0) {
    return {
      ok: false,
      reason: `${products} product${products === 1 ? " is" : "s are"} in this subcategory. Move them first.`,
    };
  }

  db.prepare(
    "DELETE FROM subcategories WHERE slug = ? AND category_slug = ?"
  ).run(subSlug, categorySlug);
  return { ok: true };
}

/**
 * Finds the subcategory a product belongs to, or makes it.
 *
 * The administrator may type a subcategory that is not in the list yet, and
 * a product is never left without one that the category can hold.
 */
export function resolveSubcategory(
  categorySlug: string | null | undefined,
  name: string | null | undefined
): string | null {
  const trimmed = name?.trim();
  if (!categorySlug || !trimmed) return null;

  const db = getDb();
  const existing = db
    .prepare(
      "SELECT name FROM subcategories WHERE category_slug = ? AND name = ? COLLATE NOCASE"
    )
    .get(categorySlug, trimmed) as { name?: string } | undefined;

  if (existing?.name) return existing.name;

  const created = createSubcategory(categorySlug, trimmed);
  if (!created.ok) {
    // The name is already taken by a case difference, so use what is there.
    const again = db
      .prepare(
        "SELECT name FROM subcategories WHERE category_slug = ? AND name = ? COLLATE NOCASE"
      )
      .get(categorySlug, trimmed) as { name?: string } | undefined;
    return again?.name ?? null;
  }
  return trimmed;
}

/* ------------------------------------------------------------------ brands */

export type BrandDetail = {
  slug: string;
  name: string;
  blurb: string | null;
  position: number;
  /** How many products carry it. */
  productCount: number;
};

/** Every brand the store sells. */
export function listBrands(): BrandDetail[] {
  const db = getDb();

  const brands = db
    .prepare("SELECT * FROM brands ORDER BY position, name")
    .all() as Row[];

  const counts = new Map<string, number>();
  for (const r of db
    .prepare(
      "SELECT brand, COUNT(*) AS n FROM products WHERE brand IS NOT NULL GROUP BY brand COLLATE NOCASE"
    )
    .all() as { brand: string | null; n: number }[]) {
    if (r.brand) counts.set(r.brand.toLowerCase(), r.n);
  }

  return brands.map((b) => {
    const name = str(b.name);
    return {
      slug: str(b.slug),
      name,
      blurb: strOrNull(b.blurb),
      position: num(b.position),
      productCount: counts.get(name.toLowerCase()) ?? 0,
    };
  });
}

/** Adds a brand. */
export function createBrand(input: {
  name: string;
  blurb?: string | null;
}): TaxonomyResult {
  const db = getDb();
  const name = input.name.trim();
  if (name.length < 1) return { ok: false, reason: "Give the brand a name." };

  const existing = db
    .prepare("SELECT slug FROM brands WHERE name = ? COLLATE NOCASE")
    .get(name);
  if (existing) {
    return {
      ok: false,
      reason: "That brand is already in the list.",
      field: "name",
    };
  }

  let slug = slugify(name);
  if (!slug) return { ok: false, reason: "Give the brand a name." };
  let n = 2;
  while (db.prepare("SELECT slug FROM brands WHERE slug = ?").get(slug)) {
    slug = `${slugify(name)}-${n}`;
    n++;
  }

  const position = num(
    (
      db
        .prepare("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM brands")
        .get() as { n: number }
    ).n
  );

  db.prepare(
    "INSERT INTO brands (slug, name, blurb, position) VALUES (?, ?, ?, ?)"
  ).run(slug, name, input.blurb?.trim() || null, position);

  return { ok: true, slug };
}

/**
 * Renames a brand.
 *
 * The products that carry it follow, so the catalogue keeps saying one
 * thing about it.
 */
export function updateBrand(
  slug: string,
  input: { name?: string; blurb?: string | null }
): TaxonomyResult {
  const db = getDb();

  const existing = db
    .prepare("SELECT slug, name FROM brands WHERE slug = ?")
    .get(slug) as Row | undefined;
  if (!existing) return { ok: false, reason: "That brand no longer exists." };

  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 1) {
      return { ok: false, reason: "Give the brand a name.", field: "name" };
    }
    const clash = db
      .prepare(
        "SELECT slug FROM brands WHERE name = ? COLLATE NOCASE AND slug != ?"
      )
      .get(name, slug);
    if (clash) {
      return {
        ok: false,
        reason: "That brand is already in the list.",
        field: "name",
      };
    }
    sets.push("name = ?");
    params.push(name);
  }
  if (input.blurb !== undefined) {
    sets.push("blurb = ?");
    params.push(input.blurb?.trim() || null);
  }

  if (!sets.length) return { ok: true };

  db.exec("BEGIN");
  try {
    params.push(slug);
    db.prepare(`UPDATE brands SET ${sets.join(", ")} WHERE slug = ?`).run(
      ...params
    );
    // The products that carry the old name follow the new one.
    if (input.name !== undefined) {
      db.prepare("UPDATE products SET brand = ? WHERE brand = ?").run(
        input.name.trim(),
        str(existing.name)
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { ok: true };
}

/** Removes a brand. One that products still carry cannot be. */
export function deleteBrand(slug: string): TaxonomyResult {
  const db = getDb();

  const existing = db
    .prepare("SELECT slug, name FROM brands WHERE slug = ?")
    .get(slug) as Row | undefined;
  if (!existing) return { ok: false, reason: "That brand no longer exists." };

  const products = num(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM products WHERE brand = ? COLLATE NOCASE"
        )
        .get(str(existing.name)) as { n: number }
    ).n
  );
  if (products > 0) {
    return {
      ok: false,
      reason: `${products} product${products === 1 ? " is" : "s are"} in this brand. Move them first.`,
    };
  }

  db.prepare("DELETE FROM brands WHERE slug = ?").run(slug);
  return { ok: true };
}

/**
 * Finds a brand by name, or makes it.
 *
 * The administrator may type a brand that is not in the list yet, and the
 * list is kept complete so the next product can pick it.
 */
export function ensureBrand(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const db = getDb();
  const existing = db
    .prepare("SELECT name FROM brands WHERE name = ? COLLATE NOCASE")
    .get(trimmed) as { name?: string } | undefined;
  if (existing?.name) return existing.name;

  const created = createBrand({ name: trimmed });
  if (!created.ok) {
    const again = db
      .prepare("SELECT name FROM brands WHERE name = ? COLLATE NOCASE")
      .get(trimmed) as { name?: string } | undefined;
    return again?.name ?? null;
  }
  return trimmed;
}
