# ConsoleSeller — Consoles & Gaming Accessories

Official repository for **ConsoleSeller** ([consoleseller.in](https://consoleseller.in)): Premium gaming consoles, controllers, and gaming gear with guaranteed delivery, live inventory management, and an end-to-end 5-day return, replacement & refund management system.

**Stack:** Next.js 16 (App Router, Turbopack, React 19) · Tailwind CSS v4 · SQLite via Node's native `node:sqlite` · Zod. Clean, zero external runtime infrastructure dependencies, fast local setup.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Setup product photos and initialize database
npm run setup

# 3. Start local development server
npm run dev
# Open http://localhost:3000
```

`npm run setup` downloads product images and seeds the database with the initial catalogue. To re-seed at any point, run `npm run seed`.

The seed creates initial staff accounts for the back office:

| Role | Email | Password |
|---|---|---|
| Admin | `consoleseller.in@gmail.com` | `myconsole@121` |
| Support | `support@consoleseller.in` | `consoleseller-support-1` |

Override them with `PF_ADMIN_EMAIL`, `PF_ADMIN_PASSWORD`, `PF_SUPPORT_EMAIL`, and `PF_SUPPORT_PASSWORD` in your `.env.local` if needed. `npm run staff` adds staff accounts to an existing database without rebuilding it, and `npm run set-role <email> <role>` modifies an existing account's role.

---

## The design

Three brand colours:

| Hex | Role |
|---|---|
| `#0071C5` | ConsoleSeller Blue — buttons, active states, focus highlights |
| `#0B1220` | Ink — typography, headers, dark admin panels |
| `#FFFFFF` | White — clean card and page background |

Typography is Inter with tabular numbers (`tnum`) for prices and tracking codes. Full-bleed hero banners on desktop and responsive grid layouts (1 to 6 columns).

### Customer & Storefront Pages
| Route | Description |
|---|---|
| `/` | Hero carousel, category tiles, featured bestsellers, and customer promises |
| `/shop` | Full catalogue with multi-facet filters, sorting, and pagination |
| `/category/[slug]` | Category-specific product listings (Consoles, Controllers, Accessories) |
| `/product/[slug]` | Product details, image gallery, specs, stock levels, and variant selectors |
| `/cart` | Real-time shopping cart and summary |
| `/checkout` | Single-page checkout with saved addresses and address verification |
| `/order/[id]` | Real-time order status, invoice details, delivery tracking, and return actions |
| `/order/[id]/return` | 5-day return and replacement request form with photo upload |
| `/account` | Customer account dashboard |
| `/account/orders` | Customer order history with 5-day return window indicators |
| `/account/returns` | Customer return & replacement requests list |
| `/account/returns/[id]` | 8-stage interactive return tracking timeline and courier pickup updates |
| `/contact` | Store contact info, FAQs, and validated inquiry submission |
| `/about` | Store background, mission, and hardware authenticity promise |
| `/privacy-policy` | Customer data handling & privacy guarantees |
| `/terms-of-service` | Standard customer terms of service |
| `/refund-policy` | 5-calendar-day return & replacement policy |

### The customer panel

`/account` is the signed-in customer's private portal:

| Section | Capabilities |
|---|---|
| Overview | Lifetime spend, order count, default addresses, recent activity |
| Orders | Complete order history, delivery tracking, return/replace action triggers |
| Returns | Real-time tracking of all return and replacement claims |
| Addresses | Manage multiple delivery addresses with default selection |
| Profile | Contact details, phone number, and password management |

Signed-in shoppers get their details pre-filled at checkout and can tick
"save this address" to keep it on the account. A saved address can be picked
back from the checkout form.

---

## Roles and the back office

There are three kinds of account. The role lives in `users.role`, and
`src/lib/roles.ts` is the single place that says what each one may do.

| Role | Can |
|---|---|
| `member` | Shop, check out, manage their own account |
| `support` | Work the queue — orders, customers, enquiries. Can see the stock; cannot change it, the catalogue or user administration |
| `admin` | Everything: catalogue, orders, customers, enquiries, stock and roles |

The support scope is deliberately provisional — it is the one part of the
permission table most likely to change.

### The admin panel

`/admin` has its own chrome — a dark sidebar, no site header or footer — and
is guarded by the layout, so a member who types the URL is sent back to their
account.

| Page | |
|---|---|
| `/admin` | Revenue, orders, customers, open enquiries, low stock, best sellers, orders by status |
| `/admin/orders` | Every order, searchable, with the status changed in place |
| `/admin/orders/[id]` | One order in full, with a link to the customer's view |
| `/admin/inventory` | Every stock line, its threshold and its level; manual adjustments; returns waiting to be checked |
| `/admin/inventory/history` | Every change to a stock level, and why it was made |
| `/admin/categories` | The categories, their subcategories and specification fields, and the brands |
| `/admin/import` | The catalogue in and out as a spreadsheet — export, template, and a preview before anything is imported |
| `/admin/messages` | Enquiries from the contact page, triaged new → open → answered → closed |
| `/admin/users` | Every account, with its role, order count and spend; roles changed and accounts removed |
| `/admin/products` | The whole catalogue — listed, delisted, draft and archived — with a SKU column, brand / stock / status / listing filters, sorting, counts beside every filter, bulk selection, and per-row archive, duplicate and delete actions |
| `/admin/products/[slug]` | One product: the editor, its photographs, and its **Variations** — the attributes it varies by and the options that come out of them |

### SKUs, status and archiving

Every product carries a **SKU**: its own short code, generated from the slug
(`playstation-5-slim-disc-1tb` → `PLAYSTATION-5-SLIM-DISC-1TB`), editable in
the product editor, unique across the catalogue, and searchable from the
admin search box. A new product gets one automatically; a collision is
resolved with a numeric suffix rather than being allowed to fail the write.

Alongside the older `listed` flag, a product now has a **status**:

| Status | |
|---|---|
| `draft` | Not finished. Hidden from the shop. |
| `published` | On sale — but only if `listed` is also true. |
| `archived` | Taken off sale, kept for its history, restorable at any time. |

A product appears on the storefront only when it is `published` **and**
`listed`. The two are deliberately separate: `listed` is the old delist
switch, and it is what keeps products that were delisted before the status
field existed hidden exactly as they were.

**Archiving is the default way to retire a product.** It hides the product
from every listing, the search and the cart, but keeps its page — which then
says it is no longer on sale — its stock, its variants and its order history.
**Deleting is the last resort:** it is restricted to administrators, it asks
first, and it is refused outright for a product that has been ordered or is
still in someone's basket, because the order lines point at it.

**Duplicating** copies a product and its variants. The copy gets its own
slug and its own SKU and starts as a **draft**, so a duplicate can never
appear in the shop before somebody has looked at it.

### The product editor

`/admin/products/new` and `/admin/products/[slug]` are the same form: the
slug decides whether it creates or edits. It is laid out in the order a
product is actually thought about.

| Section | |
|---|---|
| Basic information | Name, brand, category and subcategory, SKU and model number, condition, short and full description |
| Product images | Upload several, preview them, put them in order, choose the main one, describe and remove them |
| Pricing | Selling price, MRP, optional sale price, purchase cost (administrators only), and the discount worked out as you type |
| Stock | The number on the shelf and the low-stock threshold. A product with options is stocked by its options, so its own count is shown read-only and the options' counts are listed beside it — change those from the inventory page |
| Product specifications | A table of labels and values, with the usual ones one click away |
| Shipping and warranty | Weight, package dimensions, warranty and returns |
| SEO | SEO title, meta description, URL slug and the main photograph's alt text |
| Publishing | Save as draft, publish, or save changes and leave the product where it is — and a preview of the page the customer will see |

A new product starts as a **draft**. Publishing puts it on sale. Every field
is checked before anything is written, and the message says what is wrong:
*"The MRP cannot be lower than the selling price."*

**A product's photographs live in the database.** They used to live in the
code, as a map of the two consoles with a full set of angles; the migration
moves them in, so the back office can reorder and add to them like any
other picture. The first photograph is the main one — the picture the cards,
the search results and the catalogue table show. Uploads are written to
`public/uploads/`, which is ignored by git.

**The sale price is the price.** A product with a sale price sells for it,
everywhere: on the card, on the product page, in the basket and on the
order. The price it normally sells for is struck through beside it.

### Listing the catalogue

| Filter | |
|---|---|
| Search | Name, brand, description and SKU |
| Category | The catalogue's categories |
| Brand | Every brand in the catalogue, archived ones included |
| Stock | In stock, low stock (5 or fewer) or out of stock |
| Status | Draft, published or archived |
| Listing | Listed, delisted or both |
| Sort | Default order, price low→high, price high→low, newest, best selling |

**Best selling** is counted from the order lines — cancelled orders never
earned anything, so they do not count — and the option only appears once
the store has sold something. **Newest** uses the product's position in the
catalogue, which is the order things were added, and is the same ordering
the shop's own "Newest arrivals" filter uses.

Every filter carries its own count — "Consoles (6)", "Out of stock (1)" — so
the number beside an option is the number you will be left with. The counts
are worked out with the *other* filters applied, so they answer the question
the filter is really asking. The header says how many of the whole catalogue
match, and the table says which slice of the list is on screen.

**Stock is counted as what the product can really sell.** A product with
variants sells through them, so its variants' stock added up is the number
that matters — the product's own column is not what reaches a customer. The
Stock column, the Stock filter and the shop all use that same number, so
they cannot disagree.

**The low-stock threshold is per product and per option.** A console and a
controller do not run out at the same point, so each carries its own number
— five by default. A product counts as low when its sellable stock has
reached its threshold, or when one of its options has reached that option's
own. The Stock filter's counts are worked out on the same rule, so the
number beside "Low stock" is the number of products that would be left.

Rows can be ticked and acted on together: **publish**, **delist** or
**archive**. Every bulk action asks first, and there is no bulk delete — a
product that should go needs its own look first. When the list runs to more
than one page, the table also offers to select *everything matching the
filters*, not just the page on screen; the server works that list out again
when the action runs, so it can never reach a product the admin was not
looking at.

### Inventory

The stock is counted in **buckets**. A product with no options is one
bucket — the product itself. A product with options is one bucket per
option, each counted separately, because a 1TB console and a 2TB console
are not the same thing and run out at different times. A product's own
`stock` column is not touched while it has options.

| | |
|---|---|
| **Threshold** | Every bucket carries its own low-stock threshold — five by default. At or below it, the bucket is *low*. |
| **Level** | `in`, `low` or `out`, worked out against that bucket's own threshold. A product is low when its sellable stock has reached its threshold, or when one of its options has reached that option's own. |
| **Sellable stock** | What the shop can really buy: the options' stock added up, or the product's own count when it has no options. The cards, the catalogue's Stock column, the Stock filter and the dashboard all use this one number, so they cannot disagree. |

**A change is always a movement.** Every change to a bucket writes a row in
`inventory_movements` saying what the stock was, what it became, the reason
and the date. The change and the record of it happen in one transaction, so
the history can never disagree with the stock. The reason is required —
a change without one is refused, and the whole reason a movement carries is
what the history is made of.

The four kinds of movement:

| Kind | When |
|---|---|
| `sale` | An order took the units off the shelf |
| `restock` | An order was cancelled before it left, so the units went back |
| `return` | A cancelled order's units came back and were checked and found fit to sell |
| `adjustment` | Somebody changed a count by hand |

**Orders and the stock move together.** Placing an order writes the order
and takes the stock in one transaction: if a line cannot be filled, no
order is left behind and nothing comes off the shelf. The sale movement for
an order can only be written once — a unique index on
`inventory_movements` refuses a second one — so the same order cannot be
charged against the stock twice. Stock is never allowed below zero: the
`UPDATE` that takes it says `AND stock >= ?`, and a change that would leave
the count negative is refused rather than clipped.

**Cancelling** gives the units back when the goods never left. An order
that had already shipped or been delivered is a **return**: the units are
on their way back, but nobody has looked at them, so they are *not* put
back into sellable stock. They wait on `/admin/inventory` until somebody
settles them — **Put back into stock** if they came back fit to sell, or
**Do not restock** if they did not come back or came back damaged. Either
way the decision and the reason are recorded against the order line.

Reopening a cancelled order takes the stock off the shelf again. It is
refused while a return is still waiting for its check, because the units
are somewhere in between.

**The shop follows the same rule.** A card for a product with options says
*Choose an option* and sends the shopper to the product page, rather than
picking an option on their behalf and charging a price they never agreed
to.

> Orders placed before stock was tracked are marked `settled`: their
> stock is already in the figures on the shelf, so cancelling one does not
> give anything back. The inventory history starts with the first order
> placed after the change.

### Variations

A product that varies is described by its **attributes** — what it varies
by, and the values it may vary by. Each combination of those values is one
**option**, and each option can be bought on its own.

| Attribute | Values | |
|---|---|---|
| `Colour` | White, Midnight Blue | Controller colours |
| `Edition` | Disc, Digital | Console editions |
| `Storage` | 1TB, 2TB | Storage options |
| `Compatible models` | PS5, PS4, PC | What it works with |
| `Bundle` | Console only, Console + 1 controller | What is in the box |

The names are the store's to choose — an attribute is anything the shop
calls it. The catalogue keeps two of them: the PS5 Slim varies by
`Storage`, and the DualSense by `Colour`.

**An option carries its own everything:**

| | |
|---|---|
| **Code** | Its own SKU, unique across the catalogue, generated from its values if nobody types one |
| **Values** | What it is — the value of each attribute |
| **Price** | Its own selling price and MRP |
| **Stock** | Its own count, its own low-stock threshold, its own place in the inventory history |
| **Photograph** | Optional — its own picture, or one of the product's |
| **Barcode** | Optional, and unique when it is given |

**The same values twice is refused.** Two options of one product with the
same values are the same thing under two names, so the second one is turned
away. Two options with the same code or the same barcode are turned away
too.

**The back office adds, changes and removes them** in the **Variations**
section of the product page: the attributes at the top, the options below
them, and a form for each. An option that is in somebody's basket cannot be
removed; one that has been ordered can, because the order keeps its own copy
of the name and the price.

**The shop follows the choice.** The product page shows what the product
can be bought as — one row of buttons per attribute — and choosing one
changes the price, the photograph and what is available. An option that is
not on the shelf can still be looked at, so the shopper sees its price and
its picture, but it cannot be bought.

**Buying what is not there.** The store either takes backorders or it does
not, and the setting is on the inventory page. With them off, an option
that is not on the shelf cannot be bought. With them on, the order goes
through: the units that *are* on the shelf are taken, the missing ones are
recorded on the order line as a backorder, and the warehouse has to find
them.

### Categories, subcategories and brands

The shape of the catalogue is managed in one place: **`/admin/categories`**.

**Categories** carry the list of **specification fields** their products
are described by. A console is asked about its model, its storage, what it
connects to and what is in the box; a controller is asked about its colour,
what it works with and how long its battery lasts; an accessory is asked
what kind of thing it is and what it is compatible with.

| Category | Specification fields |
|---|---|
| **Gaming Consoles** | Model and edition · Storage capacity · Connectivity · Included accessories · Warranty |
| **Gaming Controllers** | Model and colour · Connectivity · Compatibility · Battery information · Special features · Warranty |
| **Gaming Accessories** | Accessory type · Compatibility · Connectivity · Included items · Warranty |
| **Gaming Bundles** | — the administrator adds what a bundle needs |

The four are **suggestions**, not a fixed list: the manager offers them
one click away, and a category may carry any fields the store wants. The
administrator may add fields to a category at any time, and a product may
carry specifications of its own on top — the free-form table under the
category's fields.

**Only the fields of the selected category are shown.** A product that is
put in the consoles category is asked the console questions; move it to the
controllers category and it is asked the controller ones. The fields come
first on the product page, in the order the category asks for them, and
anything else the administrator added follows.

**Subcategories** are the categories inside a category — "PS5", "PS4",
"DualSense". Each belongs to one category, so the same name may be used
twice in the catalogue without the two colliding. The product form offers
the subcategories of the category that is chosen, and a name typed that is
not in the list yet is added to it.

**Brands** are the makers the store sells. A product names its brand, and
the brand list is kept alongside so the back office can manage it.

**Nothing that is in use can be taken away.** A category that products are
in, a subcategory a product carries and a brand a product names are all
kept until the products have moved — the refusal says how many are in the
way. Renaming one is allowed, and the products that carry it follow, so
the catalogue never says two different things about the same thing.

### Import and export

The catalogue goes in and out as a spreadsheet, from **`/admin/import`**.

**Export** writes every product the back office can see — drafts and
archived ones included — so the file is a backup as well as a way to edit.
**The template** is the column names and nothing else, so it cannot be
imported by accident; what goes in each column is written beside it on the
page.

**An import is two steps, and the first one changes nothing.** The file is
read and every row is checked against the store. The administrator is shown
what would happen — which products would be made, which would change and
what exactly would change in them, and what is wrong with each row that
cannot be used. Only then is anything written.

| | |
|---|---|
| **Row-specific errors** | Every problem with a row is listed — the column and what is wrong with it — not just the first one |
| **Duplicate codes** | Two rows with the same code are both refused, and a code another product already uses is refused too |
| **Safe updates** | A row whose address is already in the catalogue changes that product. **Only the columns the file fills in are changed** — a file with one column changes one column |
| **Nothing else is touched** | A product that is not in the file is not touched, and a column that is not in the file is not touched either. A file with one row changes one product |
| **The summary** | How many products were made, how many were changed, and how many rows were left alone and why |

The stock in a file goes through the inventory, so an import's changes are
written down in the history like any other change.

**The purchase cost belongs to an administrator.** It is only in the
columns an administrator may see, only in a file an administrator may
apply, and it never appears in a preview — the preview says "purchase cost"
without giving the number away.

### The dashboard

The overview counts the catalogue properly:

| | |
|---|---|
| **Products** | Every product the catalogue holds, and how many are on the shop floor |
| **Published** | On sale |
| **Drafts** | Not on sale yet, and how many have been retired |
| **Low stock** | The products whose stock is at or below their threshold |
| **Out of stock** | The products with nothing left to sell |

**Best sellers** are counted from the orders that were not cancelled — the
units actually sold and what they came to — and the running-low list names
the option that is worst, so it says which shelf needs ordering.

### API endpoints

Everything the panel does is also available as JSON. Admin endpoints answer
`401` when nobody is signed in and `403` when the role is not allowed.

| Method | Path | |
|---|---|---|
| `GET` | `/api/admin/stats` | The dashboard numbers |
| `GET` | `/api/admin/meta` | Categories, brands, roles and status vocabularies |
| `GET` `POST` | `/api/admin/products` | The catalogue (`?q=`, `?category=`, `?brand=`, `?stock=`, `?status=`, `?listed=`, `?sort=`, `?page=`, `?limit=`); `POST` creates a product (`{"name":"…","category":"consoles","price":54990,"mrp":64990}`) or runs a bulk action (`{"action":"publish","slugs":[…]}`), or one over everything matching (`{"action":"publish","scope":"all","filters":{"brand":"Sony"}}`) |
| `GET` `PATCH` `DELETE` | `/api/admin/products/[slug]` | Read, edit, delist (`{"listed": false}`), move through the workflow (`{"status": "archived"}`), set a variant's stock (`{"variants":[{"id":"…::1tb-disc","stock":14}]}`) or delete a product |
| `GET` `POST` `PATCH` | `/api/admin/products/[slug]/images` | The product's photographs; `POST` uploads them (a form, under `files`); `PATCH` reorders them, chooses the main one, describes or removes one |
| `POST` | `/api/admin/products/[slug]/duplicate` | Copy a product and its variants; the copy is a draft |
| `GET` | `/api/admin/orders` | Every order; `?q=`, `?status=`, `?page=`, `?limit=` |
| `GET` `PATCH` | `/api/admin/orders/[id]` | Read an order, or move it along with `{"status": "shipped"}` |
| `GET` | `/api/admin/users` | Every account; `?q=`, `?role=`, `?page=`, `?limit=` |
| `GET` `PATCH` `DELETE` | `/api/admin/users/[id]` | Read, change a role, reset a password, or remove an account |
| `GET` `POST` | `/api/admin/products/[slug]/variants` | The product's options; `POST` adds one (`{"attributes":{"Colour":"White"},"price":3499,"mrp":4499,"stock":7}`) |
| `GET` `PATCH` `DELETE` | `/api/admin/products/[slug]/variants/[variantId]` | One option — read it, change it, or remove it |
| `POST` | `/api/admin/products/[slug]/variants/[variantId]/image` | Upload an option's own photograph (a form, under `files`) |
| `PATCH` | `/api/admin/products/[slug]/attributes` | What the product varies by: `{"attributes":{"Colour":["White","Midnight Blue"]}}` |
| `GET` `PATCH` | `/api/admin/settings` | The store's settings — the backorder policy |
| `GET` `POST` | `/api/admin/categories` | The categories, with their subcategories and specification fields; `POST` adds one |
| `GET` `PATCH` `DELETE` | `/api/admin/categories/[slug]` | One category — read it, rename it, change the fields it asks about, or remove it |
| `GET` `POST` | `/api/admin/categories/[slug]/subcategories` | The categories inside this category; `POST` adds one |
| `PATCH` `DELETE` | `/api/admin/categories/[slug]/subcategories/[subSlug]` | Rename or remove one |
| `GET` `POST` | `/api/admin/brands` | The brands the store sells; `POST` adds one |
| `PATCH` `DELETE` | `/api/admin/brands/[slug]` | Rename or remove one |
| `GET` | `/api/admin/products/export` | The catalogue as a spreadsheet |
| `GET` | `/api/admin/products/import/template` | The columns a file must have |
| `POST` | `/api/admin/products/import` | Read a file and say what it would do — nothing is written |
| `POST` | `/api/admin/products/import/apply` | Do what the preview said |
| `GET` | `/api/admin/inventory` | Every stock line with its threshold and level, the summary numbers, and the returns waiting to be checked |
| `GET` | `/api/admin/inventory/movements` | The inventory history (`?q=`, `?product=`, `?type=`, `?page=`, `?limit=`) |
| `POST` | `/api/admin/inventory/adjust` | Change a stock level by hand: `{"productSlug":"…","variantId":"…","mode":"set\|add\|remove","quantity":5,"reason":"Stock received","note":"…"}` |
| `POST` | `/api/admin/inventory/orders/[id]/resolve` | Settle a return: `{"action":"restock\|write_off","reason":"…"}` |
| `GET` | `/api/admin/messages` | The enquiries; `?q=`, `?status=`, `?subject=`, `?page=`, `?limit=` |
| `GET` `PATCH` | `/api/admin/messages/[id]` | Read an enquiry, or move it along with `{"status": "answered"}` |
| `GET` `PATCH` | `/api/account/profile` | The signed-in customer's own details |
| `GET` | `/api/account/orders` | The signed-in customer's own orders |
| `GET` `POST` | `/api/account/addresses` | The address book |
| `PATCH` `DELETE` | `/api/account/addresses/[id]` | Edit or remove one address |

### Navigation
The header is a three-section CSS grid:

| Section | |
|---|---|
| Left | The ConsoleSeller logo and brand name |
| Centre | **Shop Now**, **About Us**, **Contact Us** |
| Right | Search box, sign in, cart |

On desktop the grid is `1fr auto 1fr`. The outer tracks are both `1fr`, so
they are always the same width — which puts the centre track, sized to its
own content, exactly in the middle of the bar no matter how wide the logo or
the right-hand group are. Nothing is absolutely positioned, so the whole
header reflows with the viewport.

"Shop Now" takes a blue tint so the store's main destination reads at a
glance, and fills solid while you are on it. Below 1024px the centre menu
collapses into the drawer behind the hamburger.

One subtlety worth knowing: the search input carries `min-w-0` so it can
shrink. Without it the right-hand track's minimum width would exceed its
`1fr` share, the two outer tracks would stop being equal, and the centre
menu would drift off-centre. For the same reason the account and cart links
drop their text labels below 1280px — at that width the text would squeeze
the search box down to an unusable width.

**Shop Now** is the unified catalogue: every console and controller in one
grid, filterable by category and sortable by price, rating or discount. The
per-category pages under `/category/[slug]` still work and are linked from the
footer and the homepage tiles.

**Contact Us** posts to a server action that validates the message with Zod
and writes it to the `contact_messages` table. Nothing is emailed — the demo
store has no outbound mail — but the enquiries are recorded.

### Accounts are real
Registration creates a user row; passwords are hashed with **scrypt** and
compared in constant time. Sign-in issues a random 32-byte session token stored
in an HTTP-only cookie and in the `sessions` table. Orders are linked to the
signed-in user, so `/account` lists them. Every account carries a role —
`member`, `support` or `admin` — and the guards in `src/lib/guard.ts` check
it before anything is shown.

---

## The hero carousel

`/` opens with a full-bleed photograph that covers the whole hero, edge to
edge. There is no colour panel and no column split — the heading, the
description and the buttons sit directly on the image, on the side of the
frame where the photograph has room.

**The side the copy stands on follows the photograph.** A slide can say
`"side": "right"` in `data/hero.json`, and its copy moves to the right of the
frame and the scrim turns with it. That is what keeps a picture of two people
on the left from being hidden behind the words on the left: the subject is
always the part of the photograph you can see.

A scrim keeps the copy legible over any photograph: a wash of the site's ink
that is strongest under the text and fades out towards the far edge. On a
desktop it darkens the side the copy is on; below 1024px the copy moves to the
bottom of the hero and the scrim turns with it, so a phone shows the
photograph above the text rather than behind it. The headline carries its own
shadow for the same reason.

The copy sits in a column of at most 42rem. The primary button is solid white
on ink and the secondary is an outline, so both read as buttons against a
photograph. The delivery promise is made once, in the note under the buttons
and in the footer's row of promises, rather than shouted from a sticker.

**The transition is slow and quiet.** The slide that is showing dissolves in
while the one leaving softens and drifts back — a change of scene rather
than a cut — and the copy rises into place a line at a time, the eyebrow
first and the note last. The photograph itself is still, only the words
arrive. The carousel advances every six seconds; arrows, dots and swipe
gestures drive it by hand. The active slide is a wide bar, the rest are
dots. It pauses on hover, on keyboard focus, and while the tab is in the
background, and it honours `prefers-reduced-motion` (no auto-advance, no
animation). The first photograph is preloaded via `next/image`; the rest load
eagerly, because every slide is stacked in the viewport.

Slides live in `data/hero.json` and are seeded into the `hero_slides` table,
the same way the catalogue is. Edit the JSON, then either re-seed (stop the
dev server first) or run:

```bash
npm run sync-hero
```

`npm run sync-hero` only rewrites the `hero_slides` table, so it works
against a running dev server.

## Product photography

Real photographs, downloaded once by `scripts/fetch-images.mjs` into
`public/products/`:

- **PlayStation hardware** — Sony's own product photography, from the public
  `/content/dam/global_pdc/` paths on playstation.com.
- **Everything else** — freely-licensed photographs from Wikimedia Commons
  (CC BY-SA / CC BY / CC0 / public domain). Author, licence and source for
  every one of them are recorded in `data/ATTRIBUTION.md`.

Sony's brand assets remain Sony's. Swap in your own photography before running
this commercially.

To refresh the photos:

```bash
npm run images
```

`data/product-images.json` maps an image key to a public path, and
`data/catalog.json` points each product at one of those keys.

The hero photographs are a separate set, supplied with the store and kept in
`public/hero/`. They are not fetched from Commons, so `npm run images` leaves
them alone. To swap one: drop the file into `public/hero/`, add its key to
`data/hero-images.json`, point a slide at that key in `data/hero.json`, then
run `npm run sync-hero`.

---

## The catalogue

9 products across 2 categories, 4 purchasable variants. Edit
`data/catalog.json` and run `npm run seed`:

```json
{
  "slug": "playstation-5-slim-disc-1tb",
  "name": "PlayStation 5 Slim — Disc Edition 1TB",
  "brand": "Sony",
  "category": "consoles",
  "price": 54990,
  "mrp": 64990,
  "image": "ps5-slim",
  "specs": { "Storage": "1TB NVMe SSD" },
  "attributes": { "Storage": ["1TB Disc", "2TB Disc"] },
  "variants": [{ "name": "1TB Disc", "price": 54990, "mrp": 64990, "stock": 14 }]
}
```

`attributes` says what the product varies by. A variant whose name is one
of an attribute's values takes that value — so "1TB Disc" above is the
`Storage` one. A product with more than one attribute spells the values out
on the variant: `{"name": "White / 1TB", "attributes": {"Colour": "White",
"Storage": "1TB"}}`.

The **categories** in the same file carry the specification fields each one
asks its products about:

```json
{
  "slug": "consoles",
  "name": "Gaming Consoles",
  "icon": "console",
  "blurb": "Official console hardware — sealed, warranted, and ready to ship the same working day.",
  "specFields": ["Model and edition", "Storage capacity", "Connectivity", "Included accessories", "Warranty"]
}
```

`npm run seed` rebuilds `data/store.db` from scratch, so **stop the dev server
first** — on Windows it holds the file open and the rebuild fails with `EBUSY`.
The hero slides in `data/hero.json` are seeded in the same pass. To change
what a product varies by without rebuilding the whole database, run:

```bash
npm run sync-variants
```

It touches only the attributes and the options' own values — never the
stock, which belongs to the inventory. To change the categories without
rebuilding the database:

```bash
npm run sync-categories
```

It also never removes a category — one that is missing from the file is
left alone, because the products that point at it would be left stranded.

---

## Testing

```bash
npm run e2e
```

Drives headless Chrome over the DevTools Protocol — no Puppeteer dependency —
and runs 80 assertions across the whole store: page renders, hero image
loading, hero carousel slide count and auto-advance, category listing,
product variants, add to cart, cart badge, cart page, checkout
form, order creation and redirect, order confirmation, cart emptied, checkout
validation, registration, signed-in state, account page, sign-out, sign-in,
wrong-password rejection, the header navigation, the centre menu's alignment
at four viewport widths, the unified shop listing,
category filtering, price sorting, the about page, the contact form's
validation and submission, the three policy pages and their footer links, and
the mobile drawer.

It ends by signing in to the back office as the seeded admin and driving the
catalogue in a real browser: the search box, the filter and sort dropdowns,
ticking a row, the bulk toolbar, the confirmation step and the bulk action
itself, the pagination, the row actions — duplicate, archive, restore — and
the bulk action over everything matching the filters rather than just the
page. Screenshots land in `.shots/`.

The dev server must be running on port 3000
(`BASE_URL=http://localhost:3001 npm run e2e` to point it elsewhere).

The back office has its own smoke test:

```bash
npm run check:admin
```

It signs in as the seeded admin and support accounts, walks every admin page
and API endpoint, checks that an anonymous visitor is turned away, that
support cannot reach the catalogue, that delisting removes a product
from the shop while leaving its page up, that SKUs are unique and searchable,
that the status and listing filters narrow the catalogue, that archiving
hides a product and restoring brings it back, and that a product with order
history cannot be deleted.

The catalogue has a test of its own:

```bash
npm run check:catalogue
```

It drives the catalogue page the way an admin does — searching by name, brand
and SKU, filtering by category, brand, stock, status and listing, sorting by
price, newest and best selling — and checks the counts beside the filters,
the pagination, and every product and bulk action. It creates the products it
needs, takes them out again through the back office's own delete endpoint, and
leaves the products and orders it found exactly as they were.

The inventory has one too:

```bash
npm run check:inventory
```

It checks that a stock level cannot be changed without a reason, that a
change which would leave the count negative is refused and leaves the count
alone, that the change and the record of it are written together, and that
the options of a product are counted one at a time — the option that was
changed goes up, the other one and the product's own count do not.

The second half places a real order through the shop's own checkout in a
browser and then walks it through its journey: the stock comes off the
shelf, cancelling puts it back, cancelling twice does not put it back
twice, reopening takes it off again, and an order cancelled after it had
shipped waits for a stock check before anything goes back on the shelf.

Everything it creates is put back through the back office's own endpoints.

The variations have one too:

```bash
npm run check:variations
```

It checks that an option can be added, that the same values twice is
refused, that an option can be changed — with its stock change written down
in the inventory history — that a code or a barcode already in use is
refused, that an option cannot be reached through another product, and that
an option can be removed.

The second half is a shopper's. The product page shows what the product can
be bought as, the choice changes the price, and an option that is not on
the shelf cannot be bought — until the store takes backorders, when it can
be, and the order records the units the shelf did not have.

The taxonomy has one too:

```bash
npm run check:taxonomy
```

It checks that a category can be created, renamed and given specification
fields, that a subcategory can be added and renamed, that a brand can be
created and renamed — and that the product carrying it follows. It checks
that a category with products in it, a subcategory a product carries and a
brand a product names cannot be taken away, and that the refusal says how
many are in the way.

The second half is what a shopper sees: a console is asked the console
questions and a controller the controller ones, and the product page shows
the category's own fields first and anything else the administrator added
after them.

The import and export have one too:

```bash
npm run check:import
```

It checks that the catalogue can be exported and comes back as a
spreadsheet, that the template is the column names and nothing else, and
that the purchase cost is only ever in an administrator's file.

It checks that **reading a file changes nothing**, and then what a file
that is not right does: a price that is not a number, a category that does
not exist, an MRP below the price, a row with no address, two rows with
the same code and a code another product uses are each refused, with the
row and the column they are on.

It applies a file and checks that one product was made, one was changed,
one row was left alone, and that **no other product was touched** — and
that the stock change was written down in the inventory history.

The last half is the dashboard: the catalogue counted properly against the
products the API returns, and the best sellers counted from the orders that
were not cancelled.

And one that opens every page and says whether the browser complained:

```bash
npm run check:pages
```

A page can render perfectly and still be broken — a hydration mismatch, a
duplicate key, a warning in the console. None of it is in the HTML, and
none of it is caught by a suite that reads what the page says rather than
what the page does in the browser.

The product editor has one too:

```bash
npm run check:product
```

It creates a product, edits every field the form has, and checks that the
shop shows what the back office set — the sale price, the description, the
specifications, the warranty, the weight and the package size, the SEO title
and the meta description. It uploads photographs, reorders them, makes one
the main one, describes one and removes one, and checks that a file that is
not a photograph is turned away. Everything it creates is removed again
through the back office's own endpoints.

To grab a single screenshot of any page:

```bash
npm run shot -- http://localhost:3000/ my-page 1440 900 1200
```

That is `<url> <name> [width] [height] [waitMs] [full] [cookie]`. The cookie
is `name=value` and is set before the page loads, which is how the signed-in
pages are captured:

```bash
npm run shot -- http://localhost:3000/admin admin 1440 900 1200 no pf_auth=<token>
```

---

## Project layout

```
data/
  catalog.json          ← the catalogue (edit this)
  hero.json             ← the hero carousel slides (edit this)
  product-images.json   ← image key → public path
  hero-images.json      ← hero image key → public path
  image-credits.json    ← author/licence for every Commons photograph
  ATTRIBUTION.md        ← credits for every Commons photograph
  store.db              ← SQLite database (generated, gitignored)
scripts/
  fetch-images.mjs      ← downloads the product photography
  seed.mjs              ← loads catalog.json + hero.json into SQLite
  sync-hero.mjs         ← refreshes just the hero slides
  sync-categories.mjs   ← refreshes just the category rows
  sync-variants.mjs     ← refreshes what each product varies by
  staff.mjs             ← the demo admin and support accounts
  create-staff.mjs      ← adds those accounts to an existing database
  set-role.mjs          ← changes an account's role
  write-schema.mjs      ← regenerates schema.sql from src/lib/schema.ts
  lib/browser.mjs       ← the headless-Chrome driver the test scripts share
  e2e.mjs               ← browser test suite
  check-admin.mjs       ← back-office smoke test
  check-catalogue.mjs   ← catalogue test
  check-inventory.mjs   ← stock and order test
  check-variations.mjs  ← variations and purchasing test
  check-taxonomy.mjs    ← categories, subcategories, brands and specifications test
  check-import.mjs      ← import, export, validation and dashboard test
  check-pages.mjs       ← opens every page and reports what the browser complains about
  check-product-form.mjs ← product editor test
  screenshot.mjs        ← single-page screenshot helper
src/
  app/
    (shop)/             ← routes that get the site header and footer
      shop/ about/ contact/
      account/          ← the customer panel: overview, orders, addresses, profile
    admin/              ← the back office: overview, orders, inventory, messages, users, products
    api/admin/          ← back-office JSON endpoints
    api/account/        ← the signed-in customer's own endpoints
    login/ register/    ← full-height auth pages, no site chrome
  components/
    admin/              ← the back-office shell and its controls
    account/            ← the customer panel's forms
  lib/
    schema.ts           ← SQL schema (shared with the seed script)
    migrations.ts       ← columns added after the schema was first written
    db.ts  queries.ts   ← connection and typed reads
    roles.ts            ← the three roles and what each may do
    guard.ts            ← page and API guards
    product-status.ts   ← draft / published / archived
    stock.ts            ← stock levels, thresholds and the vocabulary (no database)
    inventory.ts        ← stock buckets, movements, adjustments and order stock
    variations.ts       ← attributes, option values and the backorder policy (no database)
    taxonomy.ts         ← the suggested categories and their specification fields (no database)
    taxonomy-admin.ts   ← creating and managing categories, subcategories and brands
    csv.ts              ← reading and writing spreadsheets (no database)
    product-import.ts   ← the columns, the checks, the preview and the import
    settings.ts         ← the store's own settings
    uploads.ts          ← saving an uploaded photograph
    sku.ts              ← SKU format and collision handling
    auth.ts             ← scrypt hashing, sessions, current user
    admin.ts            ← back-office queries: stats, orders, customers, enquiries
    addresses.ts        ← the address book
    cart.ts  orders.ts  actions.ts
    admin-actions.ts    ← back-office server actions
    account-actions.ts  ← customer-panel server actions
    contact.ts          ← contact-page enquiries
    order-status.ts     ← order statuses (kept apart from the database)
    message-status.ts   ← enquiry statuses (kept apart from the database)
```

---

## ⚠️ Dev gotcha: new Tailwind classes not appearing

Tailwind v4's PostCSS step only re-runs when `globals.css` changes. Editing a
`.tsx` file triggers React Fast Refresh, **not** a CSS rebuild — so a utility
class you just introduced has no rule and silently does nothing.

**Fix:** after adding a new class, touch `globals.css` (e.g. add a blank line)
and the dev server recompiles the stylesheet with a fresh scan. `globals.css`
declares explicit `@source` paths so the scan is deterministic.

If the stylesheet is still stale after a restart, delete the `.next` cache.

### ⚠️ Dev gotcha: a client component cannot import the database

`node:sqlite` is external on the server, but it cannot be pulled into a
browser bundle. A client component that imports a module which reaches
`src/lib/db.ts` does not fail at build time — Turbopack panics when it tries
to write the page, and the page returns a 500:

> the chunking context (unknown) does not support external modules
> (request: node:sqlite)

That is why the order statuses live in `src/lib/order-status.ts` and the
enquiry statuses in `src/lib/message-status.ts`, apart from `src/lib/orders.ts`
and `src/lib/contact.ts`. A client component that needs a label imports the
standalone module; a server component can import either. The same applies to
any new constant a client component needs — put it somewhere that does not
import the database.

---

## Notes and limitations

This is a **demonstration store**. The commerce flows are complete, but:

- **No real payments.** Checkout records the order; no processor is contacted
  and no card details are collected. To go live, add Stripe or Razorpay inside
  `placeOrderAction` and finalise the order from the webhook.
- **No email.** Order confirmation is rendered on-screen; nothing is sent.
- **"Forgot password?" is a placeholder** — there is no password-reset flow.
- **No saved payment methods.** Addresses are saved on the account; cards are
  not.
- **The support role is provisional.** It can work the order and enquiry
  queues, and it can see the stock, but changing a stock level is an
  administrator's job — it is a catalogue decision, like the price.
- **Returns are settled by hand.** A return is not put back into stock
  automatically. Somebody has to look at the unit and say whether it is fit
  to sell, because a returned console is not always a returned console.
- **A variation is a product-level thing.** A product's options share one
  set of attributes, so a shop that sells the same console in two unrelated
  ways — a colour *and* a bundle, say — needs two products rather than one
  with two attributes. The attribute names are the store's to choose.
- **A specification belongs to a category, not to a product.** The fields a
  console is asked about live on the console category, so every console is
  asked the same questions. A product may add specifications of its own,
  but they sit outside the category's list and do not change what the next
  product in that category is asked.
- **A category is kept while a product is in it.** The store cannot
  reorganise its catalogue around the products — a category has to be
  emptied before it can go. That is deliberate, but it does mean a
  reshuffle is a two-step job.
- **Backorders are recorded, not chased.** The store can take an order for
  something it does not have. The missing units are written on the order
  line; nothing follows them up.
- **Stock is not reserved.** A basket does not hold a unit; the stock is
  taken when the order is placed. Two shoppers can both reach the checkout
  for the last one, and the second is told so.
- **An import cannot clear a field.** A column that is empty in the file
  leaves the product's own value alone, so a half-filled spreadsheet never
  wipes the catalogue. Clearing a field is done in the product editor.
- **An import reads the same file twice.** The preview and the import are
  the same file read twice, and the file is checked again before anything is
  written — so a file that has changed since it was previewed cannot slip
  something past the check.

### Taking it further
- Add Stripe/Razorpay to `src/lib/actions.ts` and create the order from the webhook.
- Swap `node:sqlite` for Postgres by changing `src/lib/db.ts` — the query layer
  is plain SQL and the schema is portable.
- Move the enquiries queue into a support inbox when the support role is
  settled — the `contact_messages.status` column is already there for it.
