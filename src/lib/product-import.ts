import { getDb } from "./db";
import { parseCsv, toCsv, type CsvRow } from "./csv";
import {
  createProduct,
  createVariant,
  listAdminProducts,
  updateProduct,
  updateVariant,
  type ProductPatch,
} from "./admin";
import { adjustStock } from "./inventory";
import { cleanAttributes } from "./variations";

/**
 * Reading and writing the catalogue as a spreadsheet.
 *
 * An import is two steps, and the first one does nothing to the store: the
 * file is read, every row is checked, and the administrator is shown what
 * would happen — which products would be made, which would change, and what
 * is wrong with each row that cannot be used. Nothing is written until the
 * administrator says so.
 *
 * An import only ever touches the rows in the file. A product that is not
 * in the file is not touched, and a column that is not in the file is not
 * touched either. A file with one row changes one product.
 */

/** One column of the file, and what it is for. */
export type ColumnSpec = {
  key: string;
  label: string;
  required?: boolean;
  /** A note beside the column, for the ones that are only needed sometimes. */
  badge?: string;
  /** Only an administrator's file carries this one. */
  adminOnly?: boolean;
  help: string;
};

export const PRODUCT_COLUMNS: ColumnSpec[] = [
  {
    key: "slug",
    label: "Slug",
    required: true,
    help: "The product's address, e.g. playstation-5-slim-disc-1tb. It is how the product is found, so it cannot change.",
  },
  {
    key: "name",
    label: "Name",
    required: true,
    help: "What the product is called.",
  },
  {
    key: "sku",
    label: "SKU",
    help: "The product's own code. It has to be unique across the catalogue.",
  },
  { key: "brand", label: "Brand", help: "The maker." },
  {
    key: "category",
    label: "Category",
    badge: "needed for a new product",
    help: "The category's address, e.g. consoles. A product that is already in the catalogue keeps the one it has.",
  },
  {
    key: "subcategory",
    label: "Subcategory",
    help: "The category inside the category, e.g. PS5.",
  },
  {
    key: "condition",
    label: "Condition",
    help: "new, open-box or refurbished.",
  },
  {
    key: "price",
    label: "Price",
    required: true,
    help: "The selling price, in rupees.",
  },
  {
    key: "mrp",
    label: "MRP",
    required: true,
    help: "What it normally sells for. It cannot be below the selling price.",
  },
  {
    key: "sale_price",
    label: "Sale price",
    help: "While it is set, this is what the product sells for.",
  },
  {
    key: "purchase_cost",
    label: "Purchase cost",
    adminOnly: true,
    help: "What the store paid for it. Only an administrator's file carries this column.",
  },
  {
    key: "stock",
    label: "Stock",
    help: "How many are on the shelf.",
  },
  {
    key: "low_stock_threshold",
    label: "Low-stock threshold",
    help: "At or below this many units the product counts as low.",
  },
  {
    key: "status",
    label: "Status",
    help: "draft, published or archived.",
  },
  {
    key: "listed",
    label: "Listed",
    help: "true or false. A published but delisted product stays off the shop floor.",
  },
  { key: "badge", label: "Badge", help: "The little label on the card, e.g. New." },
  {
    key: "short_desc",
    label: "Short description",
    help: "One or two lines, for the card and the search result.",
  },
  { key: "description", label: "Description", help: "The whole story." },
  { key: "image", label: "Image", help: "The path to the main photograph." },
  {
    key: "specs",
    label: "Specifications",
    help: 'A JSON object of name and value, e.g. {"Storage":"1TB NVMe SSD"}.',
  },
  {
    key: "attributes",
    label: "Attributes",
    help: 'A JSON object of what the product varies by, e.g. {"Colour":["White"]}.',
  },
  {
    key: "variants",
    label: "Variations",
    help: 'A JSON array of the options, e.g. [{"name":"White","price":5499,"mrp":6499,"stock":20}].',
  },
];

export const CONDITIONS = ["new", "open-box", "refurbished"] as const;
export const STATUSES = ["draft", "published", "archived"] as const;

/* -------------------------------------------------------------- the types */

export type RowError = { column: string; message: string };

export type ImportRow = {
  /** The row's number in the file, counting the header as the first. */
  row: number;
  slug: string;
  name: string;
  action: "create" | "update" | "error";
  /** What would change, in words. */
  changes: string[];
  errors: RowError[];
};

export type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type ImportPreview = {
  filename: string;
  headers: string[];
  /** Columns in the file that are not columns we know about. */
  unknownColumns: string[];
  /** Columns a file must have. */
  missingColumns: string[];
  summary: ImportSummary;
  rows: ImportRow[];
};

/* ------------------------------------------------------------- the reading */

/** What the file says about one product, once it has been read. */
type Values = {
  slug: string;
  name: string;
  sku: string | null;
  brand: string | null;
  category: string;
  subcategory: string | null;
  condition: string;
  price: number;
  mrp: number;
  salePrice: number | null;
  purchaseCost: number | null;
  stock: number;
  lowStockThreshold: number;
  status: string;
  listed: boolean;
  badge: string | null;
  shortDesc: string | null;
  description: string | null;
  image: string | null;
  specs: Record<string, string> | null;
  attributes: Record<string, string[]> | null;
  variants: unknown[] | null;
};

type Context = {
  isAdmin: boolean;
  /** The categories the store has. */
  categories: Set<string>;
  /** Every product, by its address. */
  products: Map<string, { sku: string | null; name: string; hasVariants: boolean }>;
  /** Every code in the catalogue, and whose it is. */
  skus: Map<string, string>;
};

/** Reads the store, so the file can be checked against it. */
function buildContext(isAdmin: boolean): Context {
  const db = getDb();
  const categories = new Set(
    (db.prepare("SELECT slug FROM categories").all() as { slug: string }[]).map(
      (r) => r.slug
    )
  );

  const products = new Map<
    string,
    { sku: string | null; name: string; hasVariants: boolean }
  >();
  const skus = new Map<string, string>();

  for (const p of listAdminProducts()) {
    products.set(p.slug, {
      sku: p.sku,
      name: p.name,
      hasVariants: p.variants.length > 0,
    });
    if (p.sku) skus.set(p.sku.toUpperCase(), p.slug);
    // An option's code is a code in the catalogue too, so it counts as
    // taken.
    for (const v of p.variants) {
      if (v.sku) skus.set(v.sku.toUpperCase(), p.slug);
    }
  }

  return { isAdmin, categories, products, skus };
}

/** A whole number, or null when the cell is empty. */
function numberOrNull(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** True, false, yes, no, 1, 0 — whatever a spreadsheet writes. */
function booleanOrNull(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (["true", "yes", "1", "y"].includes(t)) return true;
  if (["false", "no", "0", "n"].includes(t)) return false;
  return null;
}

/** A JSON object, or null when the cell is empty. */
function jsonOrNull(
  text: string
): { value: unknown } | { error: string } | null {
  if (!text.trim()) return null;
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: "This is not valid JSON." };
  }
}

/**
 * Checks one row against the store.
 *
 * Every problem with a row is collected, not just the first one — an
 * administrator fixing a file wants the whole list, not one problem per
 * round trip.
 */
function validateRow(
  raw: CsvRow,
  rowNumber: number,
  context: Context,
  fileSlugs: Map<string, number[]>,
  fileSkus: Map<string, number[]>
): { row: ImportRow; values: Values | null } {
  const errors: RowError[] = [];
  const add = (column: string, message: string) =>
    errors.push({ column, message });

  const slug = (raw.slug ?? "").trim();
  const name = (raw.name ?? "").trim();
  const existing = context.products.get(slug);

  if (!slug) add("slug", "The product needs an address.");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    add(
      "slug",
      "An address is lower case, with dashes between the words."
    );
  }

  if (!name) add("name", "The product needs a name.");

  // The same address twice in one file is not two products.
  const slugRows = slug ? (fileSlugs.get(slug) ?? []) : [];
  if (slugRows.length > 1 && slugRows.includes(rowNumber)) {
    add(
      "slug",
      `Another row in this file (row ${slugRows.find((r) => r !== rowNumber)}) has the same address.`
    );
  }

  const sku = (raw.sku ?? "").trim().toUpperCase();
  if (sku) {
    const skuRows = fileSkus.get(sku) ?? [];
    if (skuRows.length > 1 && skuRows.includes(rowNumber)) {
      add(
        "sku",
        `Another row in this file (row ${skuRows.find((r) => r !== rowNumber)}) has the same code.`
      );
    }
    const owner = context.skus.get(sku);
    if (owner && owner !== slug) {
      add("sku", `Another product already uses this code (${owner}).`);
    }
  }

  const category = (raw.category ?? "").trim();
  if (!category) {
    // A product that is already in the catalogue keeps the category it
    // has; only a new one has to be told.
    if (!existing) add("category", "The product needs a category.");
  } else if (!context.categories.has(category)) {
    add("category", `There is no category called "${category}".`);
  }

  const price = numberOrNull(raw.price ?? "");
  if (price === null) add("price", "The product needs a selling price.");
  else if (price < 0) add("price", "The selling price cannot be negative.");

  const mrp = numberOrNull(raw.mrp ?? "");
  if (mrp === null) add("mrp", "The product needs an MRP.");
  else if (mrp < 0) add("mrp", "The MRP cannot be negative.");

  if (price !== null && mrp !== null && mrp < price) {
    add("mrp", "The MRP cannot be lower than the selling price.");
  }

  const salePrice = numberOrNull(raw.sale_price ?? "");
  if (salePrice !== null) {
    if (salePrice < 0) add("sale_price", "The sale price cannot be negative.");
    if (mrp !== null && salePrice > mrp) {
      add("sale_price", "The sale price cannot be above the MRP.");
    }
    if (price !== null && salePrice > price) {
      add("sale_price", "The sale price cannot be above the selling price.");
    }
  }

  const purchaseCost = numberOrNull(raw.purchase_cost ?? "");
  if (purchaseCost !== null) {
    if (!context.isAdmin) {
      add("purchase_cost", "Only an administrator's file carries a purchase cost.");
    } else if (purchaseCost < 0) {
      add("purchase_cost", "The purchase cost cannot be negative.");
    }
  }

  const stock = numberOrNull(raw.stock ?? "");
  if (stock !== null) {
    if (!Number.isInteger(stock) || stock < 0) {
      add("stock", "The stock must be a whole number of units.");
    }
  }

  const threshold = numberOrNull(raw.low_stock_threshold ?? "");
  if (threshold !== null) {
    if (!Number.isInteger(threshold) || threshold < 0) {
      add("low_stock_threshold", "The threshold must be a whole number.");
    }
  }

  const condition = (raw.condition ?? "").trim().toLowerCase();
  if (condition && !(CONDITIONS as readonly string[]).includes(condition)) {
    add("condition", "The condition must be new, open-box or refurbished.");
  }

  const status = (raw.status ?? "").trim().toLowerCase();
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    add("status", "The status must be draft, published or archived.");
  }

  const listed = booleanOrNull(raw.listed ?? "");
  if (listed === null && (raw.listed ?? "").trim()) {
    add("listed", "Say true or false.");
  }

  let specs: Record<string, string> | null = null;
  const parsedSpecs = jsonOrNull(raw.specs ?? "");
  if (parsedSpecs) {
    if ("error" in parsedSpecs) {
      add("specs", parsedSpecs.error);
    } else if (
      typeof parsedSpecs.value !== "object" ||
      parsedSpecs.value === null ||
      Array.isArray(parsedSpecs.value)
    ) {
      add("specs", "The specifications must be a JSON object of name and value.");
    } else {
      specs = Object.fromEntries(
        Object.entries(parsedSpecs.value as Record<string, unknown>).map(
          ([k, v]) => [k, String(v ?? "")]
        )
      );
    }
  }

  let attributes: Record<string, string[]> | null = null;
  const parsedAttributes = jsonOrNull(raw.attributes ?? "");
  if (parsedAttributes) {
    if ("error" in parsedAttributes) {
      add("attributes", parsedAttributes.error);
    } else if (
      typeof parsedAttributes.value !== "object" ||
      parsedAttributes.value === null ||
      Array.isArray(parsedAttributes.value)
    ) {
      add("attributes", "The attributes must be a JSON object.");
    } else {
      attributes = cleanAttributes(parsedAttributes.value);
    }
  }

  let variants: unknown[] | null = null;
  const parsedVariants = jsonOrNull(raw.variants ?? "");
  if (parsedVariants) {
    if ("error" in parsedVariants) {
      add("variants", parsedVariants.error);
    } else if (!Array.isArray(parsedVariants.value)) {
      add("variants", "The variations must be a JSON array.");
    } else {
      variants = parsedVariants.value;
      parsedVariants.value.forEach((v, i) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) {
          add("variants", `Variation ${i + 1} is not an object.`);
          return;
        }
        const item = v as Record<string, unknown>;
        if (!String(item.name ?? "").trim()) {
          add("variants", `Variation ${i + 1} needs a name.`);
        }
        const vPrice = Number(item.price);
        const vMrp = Number(item.mrp);
        if (!Number.isFinite(vPrice) || vPrice < 0) {
          add("variants", `Variation ${i + 1} needs a selling price.`);
        }
        if (!Number.isFinite(vMrp) || vMrp < 0) {
          add("variants", `Variation ${i + 1} needs an MRP.`);
        }
        if (Number.isFinite(vPrice) && Number.isFinite(vMrp) && vMrp < vPrice) {
          add(
            "variants",
            `Variation ${i + 1} has an MRP below its selling price.`
          );
        }
      });
    }
  }

  const values: Values = {
    slug,
    name,
    sku: sku || null,
    brand: (raw.brand ?? "").trim() || null,
    category,
    subcategory: (raw.subcategory ?? "").trim() || null,
    condition: condition || "new",
    price: price ?? 0,
    mrp: mrp ?? 0,
    salePrice,
    purchaseCost,
    stock: stock ?? 0,
    lowStockThreshold: threshold ?? 5,
    status: status || "draft",
    listed: listed ?? true,
    badge: (raw.badge ?? "").trim() || null,
    shortDesc: (raw.short_desc ?? "").trim() || null,
    description: (raw.description ?? "").trim() || null,
    image: (raw.image ?? "").trim() || null,
    specs,
    attributes,
    variants,
  };

  return {
    row: {
      row: rowNumber,
      slug,
      name,
      action: errors.length ? "error" : existing ? "update" : "create",
      changes: errors.length ? [] : describeChanges(raw, values, existing),
      errors,
    },
    values: errors.length ? null : values,
  };
}

/** What a row would change, in words the administrator can read. */
function describeChanges(
  raw: CsvRow,
  values: Values,
  existing: { sku: string | null; name: string; hasVariants: boolean } | undefined
): string[] {
  if (!existing) return ["a new product"];

  const changes: string[] = [];
  const has = (key: string) => Boolean((raw[key] ?? "").trim());

  if (has("name") && values.name !== existing.name) {
    changes.push(`name: ${existing.name} → ${values.name}`);
  }
  if (has("sku") && values.sku !== existing.sku) {
    changes.push(`code: ${existing.sku ?? "none"} → ${values.sku ?? "none"}`);
  }
  if (has("price")) changes.push(`price: ${values.price}`);
  if (has("mrp")) changes.push(`MRP: ${values.mrp}`);
  if (has("sale_price")) changes.push(`sale price: ${values.salePrice ?? "none"}`);
  if (has("stock")) changes.push(`stock: ${values.stock}`);
  if (has("status")) changes.push(`status: ${values.status}`);
  if (has("listed")) changes.push(`listed: ${values.listed ? "yes" : "no"}`);
  if (has("category")) changes.push(`category: ${values.category}`);
  if (has("subcategory")) changes.push(`subcategory: ${values.subcategory ?? "none"}`);
  if (has("condition")) changes.push(`condition: ${values.condition}`);
  if (has("badge")) changes.push(`badge: ${values.badge ?? "none"}`);
  if (has("low_stock_threshold")) {
    changes.push(`low-stock threshold: ${values.lowStockThreshold}`);
  }
  if (has("specs")) changes.push("specifications");
  if (has("attributes")) changes.push("attributes");
  if (has("variants")) changes.push("variations");
  if (has("image")) changes.push(`image: ${values.image ?? "none"}`);
  if (has("short_desc")) changes.push("short description");
  if (has("description")) changes.push("description");
  if (has("purchase_cost")) changes.push("purchase cost");

  return changes;
}

/**
 * Reads a file and says what would happen.
 *
 * Nothing is written. The administrator sees the whole file — every row,
 * what it would do and what is wrong with it — before anything happens.
 */
export function previewImport(
  filename: string,
  text: string,
  isAdmin: boolean
): ImportPreview {
  const context = buildContext(isAdmin);
  const parsed = parseCsv(text);

  const known = new Set(PRODUCT_COLUMNS.map((c) => c.key));
  const headers = parsed.headers;
  const unknownColumns = headers.filter((h) => h && !known.has(h));
  const missingColumns = PRODUCT_COLUMNS.filter(
    (c) => c.required && !headers.includes(c.key)
  ).map((c) => c.key);

  // The addresses and codes in the file, so the same one twice is found.
  const fileSlugs = new Map<string, number[]>();
  const fileSkus = new Map<string, number[]>();
  parsed.rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const slug = (raw.slug ?? "").trim();
    if (slug) fileSlugs.set(slug, [...(fileSlugs.get(slug) ?? []), rowNumber]);
    const sku = (raw.sku ?? "").trim().toUpperCase();
    if (sku) fileSkus.set(sku, [...(fileSkus.get(sku) ?? []), rowNumber]);
  });

  const rows: ImportRow[] = parsed.rows.map((raw, i) => {
    const { row } = validateRow(raw, i + 2, context, fileSlugs, fileSkus);
    return row;
  });

  const summary: ImportSummary = {
    total: rows.length,
    created: rows.filter((r) => r.action === "create").length,
    updated: rows.filter((r) => r.action === "update").length,
    skipped: 0,
    errors:
      rows.filter((r) => r.action === "error").length +
      parsed.errors.length,
  };

  return {
    filename,
    headers,
    unknownColumns,
    missingColumns,
    summary,
    rows,
  };
}

/* ------------------------------------------------------------ the writing */

/**
 * Applies a file.
 *
 * Only the rows that are usable are applied; the rest are reported and
 * left alone. A product that is not in the file is not touched.
 */
export function applyImport(
  filename: string,
  text: string,
  isAdmin: boolean,
  userId: number | null
): { preview: ImportPreview; summary: ImportSummary } {
  const context = buildContext(isAdmin);
  const parsed = parseCsv(text);

  const fileSlugs = new Map<string, number[]>();
  const fileSkus = new Map<string, number[]>();
  parsed.rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const slug = (raw.slug ?? "").trim();
    if (slug) fileSlugs.set(slug, [...(fileSlugs.get(slug) ?? []), rowNumber]);
    const sku = (raw.sku ?? "").trim().toUpperCase();
    if (sku) fileSkus.set(sku, [...(fileSkus.get(sku) ?? []), rowNumber]);
  });

  const rows: ImportRow[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  parsed.rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const { row, values } = validateRow(raw, rowNumber, context, fileSlugs, fileSkus);

    if (!values) {
      rows.push(row);
      skipped++;
      return;
    }

    const result = writeProduct(raw, values, context, userId);
    if (!result.ok) {
      rows.push({
        ...row,
        action: "error",
        changes: [],
        errors: [{ column: result.column ?? "row", message: result.message }],
      });
      skipped++;
      return;
    }

    rows.push({
      ...row,
      action: result.created ? "create" : "update",
      changes: result.created ? ["a new product"] : row.changes,
    });
    if (result.created) created++;
    else updated++;
  });

  const summary: ImportSummary = {
    total: parsed.rows.length,
    created,
    updated,
    skipped,
    errors: skipped,
  };

  const preview: ImportPreview = {
    filename,
    headers: parsed.headers,
    unknownColumns: parsed.headers.filter(
      (h) => h && !PRODUCT_COLUMNS.some((c) => c.key === h)
    ),
    missingColumns: PRODUCT_COLUMNS.filter(
      (c) => c.required && !parsed.headers.includes(c.key)
    ).map((c) => c.key),
    summary,
    rows,
  };

  return { preview, summary };
}

/** Writes one product, and its variations. */
function writeProduct(
  raw: CsvRow,
  values: Values,
  context: Context,
  userId: number | null
): { ok: boolean; created: boolean; message: string; column?: string } {
  const existing = context.products.get(values.slug);
  const has = (key: string) => Boolean((raw[key] ?? "").trim());

  if (!existing) {
    const created = createProduct({
      slug: values.slug,
      name: values.name,
      brand: values.brand,
      subcategory: values.subcategory,
      modelNumber: null,
      categorySlug: values.category,
      condition: values.condition as "new",
      price: values.price,
      mrp: values.mrp,
      salePrice: values.salePrice,
      purchaseCost: values.purchaseCost,
      // The count is put on by the inventory below, so the file's number is
      // recorded as a change rather than as an opening balance.
      stock: 0,
      userId,
      badge: values.badge,
      shortDesc: values.shortDesc,
      description: values.description,
      specs: values.specs ?? {},
      sku: values.sku,
      imageAlt: null,
      seoTitle: null,
      metaDescription: null,
      weightGrams: null,
      packageLength: null,
      packageWidth: null,
      packageHeight: null,
      warranty: null,
      returns: null,
    });

    if (!created.ok) {
      return { ok: false, created: false, message: created.reason ?? "The product could not be made." };
    }
  }

  // The patch only carries the columns the file actually filled in, so a
  // file with one column changes one column.
  const patch: ProductPatch = {};
  if (has("name")) patch.name = values.name;
  if (has("sku")) patch.sku = values.sku;
  if (has("brand")) patch.brand = values.brand;
  if (has("subcategory")) patch.subcategory = values.subcategory;
  if (has("category")) patch.categorySlug = values.category;
  if (has("condition")) patch.condition = values.condition as "new";
  if (has("price")) patch.price = values.price;
  if (has("mrp")) patch.mrp = values.mrp;
  if (has("sale_price")) patch.salePrice = values.salePrice;
  if (has("purchase_cost") && context.isAdmin) {
    patch.purchaseCost = values.purchaseCost;
  }
  if (has("badge")) patch.badge = values.badge;
  if (has("short_desc")) patch.shortDesc = values.shortDesc;
  if (has("description")) patch.description = values.description;
  if (has("image")) patch.image = values.image;
  if (has("specs") && values.specs) patch.specs = values.specs;

  if (Object.keys(patch).length) updateProduct(values.slug, patch);

  // The stock goes through the inventory, so the change is written down.
  //
  // A product that is stocked by its options is not counted itself — the
  // options carry the stock — so the file's product-level count is left
  // alone for one, and the options' own counts are written instead.
  const stockedByOptions =
    (existing?.hasVariants ?? false) || (values.variants?.length ?? 0) > 0;

  if (has("stock") && !stockedByOptions) {
    const moved = adjustStock({
      productSlug: values.slug,
      variantId: null,
      mode: "set",
      quantity: values.stock,
      reason: "Imported from a file",
      userId,
    });
    if (!moved.ok) {
      return { ok: false, created: false, message: moved.reason, column: "stock" };
    }
  } else if (has("stock") && stockedByOptions && !existing?.hasVariants) {
    // A new product that the file gives options to: the options carry the
    // stock, so the product's own count is left at nothing.
    const moved = adjustStock({
      productSlug: values.slug,
      variantId: null,
      mode: "set",
      quantity: 0,
      reason: "Imported from a file",
      userId,
    });
    if (!moved.ok) {
      return { ok: false, created: false, message: moved.reason, column: "stock" };
    }
  }

  if (has("low_stock_threshold")) {
    setThreshold(values.slug, null, values.lowStockThreshold);
  }

  if (has("attributes") && values.attributes) {
    setAttributes(values.slug, values.attributes);
  }

  if (has("status")) {
    const status = values.status;
    if (status === "published") {
      getDb()
        .prepare("UPDATE products SET status = 'published', listed = 1 WHERE slug = ?")
        .run(values.slug);
    } else {
      getDb()
        .prepare("UPDATE products SET status = ? WHERE slug = ?")
        .run(status, values.slug);
    }
  }
  if (has("listed")) {
    getDb()
      .prepare("UPDATE products SET listed = ? WHERE slug = ?")
      .run(values.listed ? 1 : 0, values.slug);
  }

  if (has("variants") && values.variants) {
    const result = writeVariants(values.slug, values.variants, userId);
    if (!result.ok) {
      return { ok: false, created: false, message: result.message, column: "variants" };
    }
  }

  return { ok: true, created: !existing, message: "done" };
}

/** Writes the options of a product. */
function writeVariants(
  slug: string,
  variants: unknown[],
  userId: number | null
): { ok: boolean; message: string } {
  const db = getDb();
  const existing = db
    .prepare("SELECT id, name, attributes FROM variants WHERE product_slug = ?")
    .all(slug) as { id: string; name: string; attributes: string | null }[];

  for (const v of variants) {
    const item = v as Record<string, unknown>;
    const name = String(item.name ?? "").trim();
    const attributes = item.attributes
      ? (item.attributes as Record<string, string>)
      : {};

    // An option is found by its values, so the same option is changed rather
    // than made twice.
    const match = existing.find((e) => {
      const eAttrs = e.attributes ? (JSON.parse(e.attributes) as Record<string, string>) : {};
      const keys = new Set([...Object.keys(eAttrs), ...Object.keys(attributes)]);
      for (const key of keys) {
        if ((eAttrs[key] ?? "") !== (attributes[key] ?? "")) return false;
      }
      return true;
    });

    const input = {
      name,
      attributes,
      sku: item.sku ? String(item.sku) : null,
      price: Number(item.price),
      mrp: Number(item.mrp),
      stock: item.stock === undefined ? undefined : Number(item.stock),
      lowStockThreshold:
        item.lowStockThreshold === undefined
          ? undefined
          : Number(item.lowStockThreshold),
      image: item.image ? String(item.image) : null,
      barcode: item.barcode ? String(item.barcode) : null,
    };

    if (match) {
      const result = updateVariant(slug, match.id, input, userId);
      if (!result.ok) return { ok: false, message: result.reason ?? "An option could not be changed." };
    } else {
      const result = createVariant(slug, input, userId);
      if (!result.ok) return { ok: false, message: result.reason ?? "An option could not be made." };
    }
  }

  return { ok: true, message: "done" };
}

/** Sets the low-stock threshold of a product or an option. */
function setThreshold(slug: string, variantId: string | null, threshold: number) {
  const db = getDb();
  if (variantId) {
    db.prepare(
      "UPDATE variants SET low_stock_threshold = ? WHERE id = ? AND product_slug = ?"
    ).run(threshold, variantId, slug);
  } else {
    db.prepare(
      "UPDATE products SET low_stock_threshold = ? WHERE slug = ?"
    ).run(threshold, slug);
  }
}

/** Sets what a product varies by. */
function setAttributes(slug: string, attributes: Record<string, string[]>) {
  getDb()
    .prepare("UPDATE products SET attributes = ? WHERE slug = ?")
    .run(JSON.stringify(attributes), slug);
}

/* ------------------------------------------------------------ the export */

/**
 * The catalogue as a spreadsheet.
 *
 * Every product the back office can see, drafts and archived ones
 * included, so the file is a backup as well as a way to edit.
 *
 * The purchase cost is only written for an administrator. For anybody else
 * the column is not in the file at all, so the cost is not in it to find.
 */
export function exportCatalogue(isAdmin: boolean): string {
  const columns = PRODUCT_COLUMNS.filter((c) => !c.adminOnly || isAdmin);
  const headers = columns.map((c) => c.key);

  const products = listAdminProducts();
  const rows: CsvRow[] = products.map((p) => {
    const row: CsvRow = {
      slug: p.slug,
      name: p.name,
      sku: p.sku ?? "",
      brand: p.brand ?? "",
      category: p.category_slug ?? "",
      subcategory: p.subcategory ?? "",
      condition: p.condition,
      price: String(p.price),
      mrp: String(p.mrp),
      sale_price: p.sale_price === null ? "" : String(p.sale_price),
      // A product that is stocked by its options is not counted itself —
      // the options carry the count — so the column is left empty for one.
      stock: p.variants.length ? "" : String(p.stock),
      low_stock_threshold: String(p.low_stock_threshold),
      status: p.status,
      listed: p.listed ? "true" : "false",
      badge: p.badge ?? "",
      short_desc: p.short_desc ?? "",
      description: p.description ?? "",
      image: p.image ?? "",
      specs: JSON.stringify(p.specs ?? {}),
      attributes: JSON.stringify(p.attributes ?? {}),
      variants: JSON.stringify(
        p.variants.map((v) => ({
          name: v.name,
          sku: v.sku,
          price: v.price,
          mrp: v.mrp,
          stock: v.stock,
          lowStockThreshold: v.low_stock_threshold,
          image: v.image,
          barcode: v.barcode,
          attributes: v.attributes,
        }))
      ),
    };
    if (isAdmin) {
      row.purchase_cost =
        p.purchase_cost === null ? "" : String(p.purchase_cost);
    }
    return row;
  });

  return toCsv(headers, rows);
}

/** The template: the columns, and nothing else. */
export function importTemplate(isAdmin: boolean): string {
  const columns = PRODUCT_COLUMNS.filter((c) => !c.adminOnly || isAdmin);
  return toCsv(
    columns.map((c) => c.key),
    []
  );
}
