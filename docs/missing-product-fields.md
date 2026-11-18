# The product fields the editor does not have

The product editor was redesigned on 18 November 2026. The brief it was
written against named a set of fields that this shop's catalogue does not
carry. This is what each of them would take, so that the decision to add
them — or to leave them out — is made on the facts rather than on the
shape of the brief.

**Nothing here is implemented.** The editor is stable and the fields below
are not in it.

## How the shop's catalogue is put together

Every piece of information the shop has about a product lives in one of
these places. A field can only be added by joining one of them.

| Where | What it holds | Example |
| --- | --- | --- |
| `products` (a column) | A thing that is true of the product itself | `price`, `mrp`, `stock`, `condition` |
| `products.specs` (JSON) | A free table of name and value, shown on the product page | `{"Storage": "1TB NVMe SSD"}` |
| `categories.spec_fields` (JSON) | The questions a category asks every product in it | Gaming Consoles asks for storage, connectivity, warranty |
| `variants` (a row) | A thing that is true of one option of a product | the 1TB Disc edition's own price, stock and code |
| `brands` (a row) | A list the back office manages | Sony, Zephyr |
| `store_settings` (a key) | A rule for the whole shop | the return window, in days |
| A managed list | Anything with its own screen in the back office | categories, subcategories, brands |

The last two matter most: a field that is a **choice** needs somewhere for
the choices to live, and a field that is a **rule for every product** does
not.

## The fields, one by one

### 1. Manufacturer

| | |
| --- | --- |
| What the brief wants | A searchable dropdown of manufacturers, alongside the brand |
| Does it exist? | **No.** `products.brand` is a free-text column; `brands` is a managed list of names. There is no `manufacturers` table and no `manufacturer` column |
| Schema change | A `manufacturers` table **and** a `products.manufacturer` column |
| New source of truth? | **Yes** — a managed list, like `brands`, needing its own screen under Catalogue |
| Is it worth it? | For this shop, probably not. Sony, Microsoft and Nintendo make both the consoles and the controllers; "brand" already says who made it. A manufacturer list would be a second name for the same thing |

### 2. Unit (Box, Piece, Kg)

| | |
| --- | --- |
| What the brief wants | A dropdown for the product's unit |
| Does it exist? | **No.** There is no `unit` column and no list of units. Quantity is a bare integer everywhere |
| Schema change | A `products.unit` column |
| New source of truth? | **Yes** — the list of units (Box, Piece, Kg, Metre, Set) has to come from somewhere. A fixed list in the code is the smallest version; a managed list is the larger one |
| Is it worth it? | Only if the shop starts selling by weight or by length. For consoles and controllers, "one" is implied |

### 3. Intra-state and Inter-state tax rates, and HSN/SAC

| | |
| --- | --- |
| What the brief wants | Intra-state tax rate, inter-state tax rate, HSN/SAC code, and a tax calculation that uses them |
| Does it exist? | **No.** There is no tax column on products, variants, orders or order items. The shop has one tax-like string — `"Inclusive of all taxes"` on the product page — and the store's own GSTIN, which is a legal identity rather than a rate |
| Schema change | A `products.tax_rate` column, a `products.hsn_code` column, and — for the rates to mean anything — tax columns on `orders` and `order_items`, plus a change to the checkout total |
| New source of truth? | **Yes** — the rate card. It is not a dropdown of choices: it is a table of rates that changes, and the intra/inter split is a rate plus a rule about where the customer is |
| Is it worth it? | **This is the big one, and it is not a form-field change.** The shop's prices are already tax-inclusive and said so on the page. Adding rates means deciding whether a price is entered inclusive or exclusive, reworking the checkout total, the order records, the invoices and the reports, and — for a real Indian retailer — the tax filing. It is a business change, not an editor change |

### 4. Minimum order quantity, maximum order quantity, reorder point

| | |
| --- | --- |
| What the brief wants | Minimum order quantity, maximum order quantity, and a reorder point |
| Does it exist? | **Partly.** `products.low_stock_threshold` **is** the reorder point — the number at or below which the product counts as low and appears on the dashboard. It is in the editor as "Reorder point" |
| Schema change | Two columns (`min_order_qty`, `max_order_qty`) |
| New source of truth? | **No** — they are numbers on the product, not a list |
| Is it worth it? | The reorder point is done. A minimum order quantity is a real rule (one controller per order, two cables minimum) and is small: a column, a field, and a check at the cart. A maximum order quantity is a stock cap and is rarer |

### 5. Goods / Service (product type)

| | |
| --- | --- |
| What the brief wants | A radio choice between "Goods" and "Service" |
| Does it exist? | **No.** There is no `type` column. The closest thing is `products.condition` — New, Open box, Refurbished — which answers "what condition is it in", not "is it a thing you can hold" |
| Schema change | A `products.type` column |
| New source of truth? | **No** — it is a choice of two |
| Is it worth it? | Only if the shop starts selling something that is not a thing it ships — a repair, a warranty plan, a subscription. The editor's "Type" section currently holds the condition, which is the choice that actually matters here |

### 6. Ship in separate package

| | |
| --- | --- |
| What the brief wants | A checkbox saying the item travels in its own package |
| Does it exist? | **No.** The order record has a `shipping_method` and a `custom_shipping_method`, but those are chosen per order in the back office, not per product |
| Schema change | A `products.ship_separate` column (or a boolean on the variant, for a bundle whose parts travel apart) |
| New source of truth? | **No** — it is a yes or no |
| Is it worth it? | Small, but it needs a consumer: something has to read the flag when a label is made or a parcel is planned. A field that nothing reads is a field that lies |

### 7. Per-product return period

| | |
| --- | --- |
| What the brief wants | Returnable yes/no, a return period, and a unit (days or months) |
| Does it exist? | **Partly.** `products.returns` is a free-text note, and the shop reads the two words `non-returnable` in it as a refusal — everything else is returnable. The **window** (how many days) is one global setting, `return_window_days`, the same for every product, and the editor already shows it |
| Schema change | A `products.return_period_days` column, if the window is to differ per product |
| New source of truth? | **No** — it is a number. But the refusal rule itself is a rule, and it now lives in one place (`isReturnableNote` in `src/lib/return-policy.ts`) so that the back office and the shop agree |
| Is it worth it? | The global window is the published policy and is right for a shop this size. A per-product window is how a shop handles "this one is 30 days because it is a warranty". Rare |

## The short version

| Field | Schema change | New source of truth | Effort |
| --- | --- | --- | --- |
| Manufacturer | Table + column | **Yes** — a managed list | Medium |
| Unit | Column | **Yes** — a list of units | Small |
| Intra/inter-state tax, HSN/SAC | Columns on products, orders and order items | **Yes** — a rate card | **Large** |
| Minimum / maximum order quantity | Two columns | No | Small |
| Goods / Service | Column | No | Small |
| Ship in separate package | Column | No | Small (needs a consumer) |
| Per-product return period | Column | No | Small |

## What would actually be worth doing

Three of the seven are a day's work each and would earn their place:

- **Minimum order quantity** — a rule the cart can check, on a product that
  has a real minimum.
- **Goods / Service** — one column and one radio, ready for the day the
  shop sells something it does not ship.
- **A unit of measure** — if the shop starts selling cables by the metre or
  weight, this stops being "one of a thing".

Two need a list before they can be built:

- **Manufacturer** — only if "brand" and "maker" are genuinely different
  things for this shop. They are not, today.
- **Tax and HSN/SAC** — only with a rate card and a decision about whether
  prices are inclusive or exclusive. This is the one that would change the
  shop's day-to-day arithmetic, and it should be done on its own, with its
  own plan.

One is already there under another name:

- **Reorder point** — `low_stock_threshold`, in the editor now.
