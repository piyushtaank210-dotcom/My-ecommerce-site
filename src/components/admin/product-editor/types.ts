import type { ProductCondition } from "@/lib/types";

/**
 * The state of the product editor, and the ways it is changed.
 *
 * The editor is one form, but it is written as several sections, and
 * each of them needs a little of the same handful of things: the name the
 * product is being given, the prices, the category it is in, and the
 * mistakes the last save came back with. Rather than pass all of that to
 * every section, the sections are handed this one object.
 */
export type EditorApi = {
  /** True while the product has never been saved. */
  isNew: boolean;
  /** The product's name as it is being typed. */
  name: string;
  /** The address the product is reached at. */
  slug: string;
  /** What the customer pays. */
  price: number;
  /** What it normally sells for. */
  mrp: number;
  /** The promotional price, when there is one. */
  salePrice: number;
  /** The title a search engine is shown. */
  seoTitle: string;
  /** The description a search engine is shown. */
  metaDescription: string;
  /** The category the product is in. */
  categorySlug: string;
  /** The short label under the category. */
  subcategory: string;
  /** The maker. */
  brand: string;
  /** The product's own code. */
  sku: string;
  /** The maker's own model number. */
  modelNumber: string;
  /** What the store paid for it. Only an administrator ever sees this. */
  purchaseCost: number | null;
  /** What condition the item is in. */
  condition: ProductCondition;
  /** What the maker promises, in the shop's own words. */
  warranty: string;
  /** The mark the card carries, when it carries one. */
  badge: string;
  /** What the shop does if something goes wrong. */
  returns: string;
  /** The sentence the card and the search result show. */
  shortDesc: string;
  /** The text a screen reader reads for the main photograph. */
  imageAlt: string;
  /** The words the product is found by. */
  tags: string[];

  setName: (value: string) => void;
  setSlug: (value: string) => void;
  setPrice: (value: number) => void;
  setMrp: (value: number) => void;
  setSalePrice: (value: number) => void;
  setSeoTitle: (value: string) => void;
  setMetaDescription: (value: string) => void;
  setCategorySlug: (value: string) => void;
  setSubcategory: (value: string) => void;
  setBrand: (value: string) => void;
  setCondition: (value: ProductCondition) => void;
  setTags: (value: string[]) => void;
  setBadge: (value: string) => void;

  /** The mistake a field was refused for, if it was. */
  err: (field: string) => string | undefined;
  /** Says that something has been changed and not yet saved. */
  markDirty: () => void;
};

/**
 * What a category is, and what it asks its products about.
 */
export type CategoryOption = {
  slug: string;
  name: string;
  /** The specification fields every product in this category is asked about. */
  specFields: string[];
};

/** A category inside a category. */
export type SubcategoryOption = {
  category_slug: string;
  name: string;
};
