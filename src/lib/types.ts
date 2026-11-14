import type { Role } from "./roles";
import type { ProductStatus } from "./product-status";

export type Category = {
  slug: string;
  name: string;
  icon: string | null;
  blurb: string | null;
  /**
   * What this category asks its products about.
   *
   * A console is asked about its model, its storage and what is in the
   * box; a controller is asked about its colour and what it works with.
   */
  spec_fields: string[];
  position: number;
};

/** A category inside a category. */
export type Subcategory = {
  slug: string;
  category_slug: string;
  name: string;
  position: number;
};

/** A brand the store sells. */
export type Brand = {
  slug: string;
  name: string;
  blurb: string | null;
  position: number;
};

export type Variant = {
  id: string;
  product_slug: string;
  name: string;
  /** The option's own code, unique across the catalogue. */
  sku: string | null;
  price: number;
  mrp: number;
  stock: number;
  /** The number at or below which this option counts as low. */
  low_stock_threshold: number;
  /** This option's own photograph, when it has one. */
  image: string | null;
  /** This option's own barcode, when it has one. */
  barcode: string | null;
  /** What this option is: the value of each attribute it has. */
  attributes: Record<string, string>;
  position: number;
};

/** A picture of a product. */
export type GalleryImage = {
  src: string;
  alt: string;
};

/** One row of a product's gallery, as the back office keeps it. */
export type ProductImage = {
  id: string;
  product_slug: string;
  path: string;
  alt: string | null;
  position: number;
};

/** What condition a product is in. */
export const PRODUCT_CONDITIONS = ["new", "open-box", "refurbished"] as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const PRODUCT_CONDITION_LABEL: Record<ProductCondition, string> = {
  new: "New",
  "open-box": "Open box",
  refurbished: "Refurbished",
};

/** Anything unrecognised is treated as new. */
export function parseProductCondition(value: unknown): ProductCondition {
  const s = String(value ?? "").trim().toLowerCase();
  return (PRODUCT_CONDITIONS as readonly string[]).includes(s)
    ? (s as ProductCondition)
    : "new";
}

export type Product = {
  slug: string;
  /** The product's own code. Unique, editable, generated from the slug. */
  sku: string | null;
  name: string;
  brand: string | null;
  category_slug: string | null;
  /** A short label under the category — "PS5", "DualSense", "Charging". */
  subcategory: string | null;
  /** The maker's own model number, for the ones that have one. */
  model_number: string | null;
  price: number;
  mrp: number;
  /** A promotional price. When it is set, this is what the product sells for. */
  sale_price: number | null;
  /** What it cost the store. Only an administrator ever sees this. */
  purchase_cost: number | null;
  rating: number;
  reviews: number;
  stock: number;
  /** The number at or below which this product counts as low on stock. */
  low_stock_threshold: number;
  /**
   * The stock the shop can really sell.
   *
   * A product with options sells through them, so this is the options'
   * stock added up. A product without them is its own stock.
   */
  sellable_stock: number;
  /** How many options this product has. Zero means it is stocked as itself. */
  option_count: number;
  condition: ProductCondition;
  badge: string | null;
  short_desc: string | null;
  /** The long description. */
  description: string | null;
  specs: Record<string, string>;
  /**
   * What this product varies by.
   *
   * "Colour" with White and Midnight Blue, "Storage" with 1TB and 2TB —
   * each combination of values is an option that can be bought on its own.
   */
  attributes: Record<string, string[]>;
  image: string | null;
  /** The text a screen reader reads for the main photograph. */
  image_alt: string | null;
  seo_title: string | null;
  meta_description: string | null;
  /** How much the thing weighs, in grams. */
  weight_grams: number | null;
  package_length: number | null;
  package_width: number | null;
  package_height: number | null;
  warranty: string | null;
  returns: string | null;
  /** False once an admin has pulled the product out of the shop. */
  listed: boolean;
  /** Where the product sits in the catalogue's workflow. */
  status: ProductStatus;
  position: number;
};

export type ProductWithVariants = Product & { variants: Variant[] };

/**
 * The filters the back office narrows the catalogue by.
 *
 * They travel in the URL, in a bulk action and in the JSON API, so they are
 * kept as plain strings and turned into a query in one place.
 */
export type CatalogueFilters = {
  q?: string;
  category?: string;
  brand?: string;
  stock?: string;
  status?: string;
  listed?: string;
};

export type CartLine = {
  id: number;
  quantity: number;
  product: Product;
  variant: Variant | null;
  unitPrice: number;
  unitMrp: number;
  lineTotal: number;
};

export type Cart = {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  savings: number;
  shipping: number;
  total: number;
};

export type OrderItem = {
  id?: number;
  product_slug: string;
  /** The option it was bought in, when it had one. */
  variant_id: string | null;
  variant_name: string | null;
  name: string;
  price: number;
  quantity: number;
  /**
   * Where the line's stock stands.
   *
   * `deducted` — the stock is off the shelf and the order is live.
   * `restocked` — it went back on the shelf when the order was cancelled.
   * `awaiting_check` — the goods are coming back but have not been checked.
   * `returned` — they came back and are back in stock.
   * `written_off` — they did not come back, or came back damaged.
   * `settled` — an order from before stock was tracked; nothing to give back.
   */
  stock_state: string;
  stock_state_note: string | null;
  /**
   * How many of the units are not on the shelf.
   *
   * It is only ever above zero when the store takes backorders: the order
   * went through, and the warehouse has to find the missing units.
   */
  backordered: number;
};

export type Order = {
  id: string;
  created_at: string;
  user_id: number | null;
  name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  pincode: string;
  notes: string | null;
  subtotal: number;
  shipping: number;
  total: number;
  payment_method: string;
  /**
   * The payment provider the order was paid through, when there is one.
   */
  payment_gateway: string | null;
  /**
   * The provider's own reference for the payment. It is what a refund
   * is sent against, so it is written down only once the provider has
   * confirmed the money.
   */
  payment_reference: string | null;
  status: string;
  delivered_at?: string | null;
  items: OrderItem[];
};

export type SortKey =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "discount"
  | "best-selling";

export type HeroLink = {
  label: string;
  href: string;
};

export type HeroSlide = {
  id: string;
  image: string;
  /**
   * A film to show instead of the photograph, on a screen big enough to
   * play it. The picture is still what a phone shows.
   */
  video: string | null;
  /**
   * The film's own first frame, held as a still.
   *
   * It is what the browser shows while the film is still downloading, so
   * the picture on screen when the hero opens is the frame the film opens
   * on — the scene does not jump when the film takes over from the still.
   */
  video_poster: string | null;
  /**
   * The picture a phone shows, in the shape of a phone's screen.
   *
   * A wide screen is a landscape frame and a phone is not, so the same
   * photograph cut for one is cropped badly in the other. Each slide can
   * name its own picture for a phone, and the wide screen keeps the one it
   * has.
   */
  mobile_image: string | null;
  /**
   * The description of the phone's own picture.
   *
   * It is a different photograph, so it is described differently — the
   * words that fit one picture do not fit the other.
   */
  mobile_alt: string | null;
  /**
   * The film's own first frame, for the phone's own film.
   *
   * The same job as `video_poster`, for the cut that a phone plays.
   */
  mobile_video_poster: string | null;
  /**
   * A film to play on a phone, in the shape of a phone's screen.
   *
   * A film cut for a wide screen is mostly black when it is cut to a
   * phone's portrait shape, so a phone gets its own cut — a different
   * file, cut to the shape it is shown in.
   */
  mobile_video: string | null;
  alt: string;
  image_position: string;
  /**
   * Where the phone's own picture is cropped to.
   *
   * The same rule as `image_position`, for the phone's cut: where the
   * frame the picture is taken from sits when the picture is cropped to
   * the shape of the screen it is shown on.
   */
  mobile_position: string | null;
  eyebrow: string | null;
  title: string;
  body: string | null;
  primary: HeroLink | null;
  secondary: HeroLink | null;
  note: string | null;
  /**
   * Which side of the frame the copy stands on.
   *
   * It follows the photograph: a picture of two people on the left puts the
   * copy on the right, so the words never sit on top of the subject.
   */
  side: "left" | "right";
  position: number;
};

/* ------------------------------------------------------------------ people */

export type Address = {
  id: number;
  user_id: number;
  label: string;
  name: string;
  phone: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
};

/** A member as the back office sees them — with their order and spend. */
export type CustomerSummary = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  created_at: string;
  order_count: number;
  total_spent: number;
};

/** A row in the admin order list. */
export type OrderSummary = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  city: string;
  state: string;
  total: number;
  item_count: number;
  payment_method: string;
  status: string;
  user_id: number | null;
};

export type ContactMessage = {
  id: number;
  name: string;
  email: string;
  subject: string;
  order_id: string | null;
  message: string;
  status: string;
  handled_by: number | null;
  handled_by_name: string | null;
  handled_at: string | null;
  /** What became of the notification the shop was sent about it. */
  email_status: string | null;
  email_sent_at: string | null;
  created_at: string;
};

export type AdminStats = {
  revenue: number;
  orders: number;
  customers: number;
  /** The products that are on the shop floor. */
  products: number;
  delisted: number;
  openMessages: number;
  /** The products whose stock is at or below their threshold. */
  lowStock: number;
  /** The products with nothing left to sell. */
  outOfStock: number;
  /** Every product the catalogue holds, on sale or not. */
  totalProducts: number;
  publishedProducts: number;
  draftProducts: number;
  archivedProducts: number;
  revenueLast30: number;
  ordersLast30: number;
  customersLast30: number;
  byStatus: { status: string; count: number }[];
  recentOrders: OrderSummary[];
  lowStockProducts: {
    slug: string;
    name: string;
    variant_name: string | null;
    stock: number;
    threshold: number;
    level: string;
  }[];
  topProducts: {
    slug: string;
    name: string;
    units: number;
    revenue: number;
  }[];
};
