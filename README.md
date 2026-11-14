# ConsoleSeller — Consoles & Gaming Accessories

Official repository for **ConsoleSeller** ([consoleseller.in](https://consoleseller.in)): Premium gaming consoles, controllers, and gaming gear with guaranteed delivery, live inventory management, and an end-to-end 7-day return, replacement & refund management system.

**Stack:** Next.js 16 (App Router, Turbopack, React 19) · Tailwind CSS v4 · PostgreSQL via `pg` · Zod.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Setup product photos and seed the SQLite file
npm run setup

# 3. Move the catalogue into PostgreSQL
npm run db:migrate

# 4. Start local development server
npm run dev
# Open http://localhost:3000
```

`npm run setup` downloads product images and seeds `data/store.db` with the initial catalogue. `npm run db:migrate` then moves that into PostgreSQL — the shop's database — and is safe to run again: the tables are emptied first, so a second run leaves the same data rather than two copies of it.

To re-seed the SQLite file at any point, run `npm run seed` and then `npm run db:migrate` again.

### The database

The shop's data lives in one PostgreSQL database, which every instance of the shop reads and writes — so an order placed on one instance is on the next one too. The connection string is read from the environment, from `DATABASE_URL`.

> The connection string is a secret, so it is never written into the source. Put it in `.env.local` in the project root — that file is ignored by Git, so the password stays out of the repository — or set `DATABASE_URL` in the environment settings of whichever machine runs the shop. If the variable is missing, the shop says so rather than starting up against a database nobody chose.

#### The deployment needs `DATABASE_URL` set

A deployment has no `.env.local` — that file is ignored by Git and never
travels — so the connection string has to be in the **environment settings of
the host**. On Vercel that is *Settings → Environment Variables*, and the
variable must be named `DATABASE_URL`. It has to be set for **every
environment** the shop is built in, including *Preview*, because a preview
build is a build too.

If it is missing, every page that needs the catalogue fails. The shop now
says so plainly instead of failing with a bare "something went wrong", and
it says what to do:

```
https://your-shop.example/api/health
```

answers the question in one line, for a script to read:

```json
{ "ok": false, "database": "not set",
  "hint": "Set DATABASE_URL in the environment of the host this is deployed to, and redeploy." }
```

A `.env.local` is not enough for a deployment, and a variable set only in
Vercel's *Production* environment is not enough for a preview build.

The SQLite file in `data/` is what the shop kept its data in before. It is now only the seed — the file the migration reads from — and the scripts that check the catalogue read it directly.

To check the database is there and holds together:

```bash
npm run check:database
```

The seed creates initial staff accounts for the back office:

| Role | Email | Password |
|---|---|---|
| Admin | `consoleseller.in@gmail.com` | `myconsole@121` |
| Support | `support@consoleseller.in` | `consoleseller-support-1` |

Override them with `PF_ADMIN_EMAIL`, `PF_ADMIN_PASSWORD`, `PF_SUPPORT_EMAIL`, and `PF_SUPPORT_PASSWORD` in your `.env.local` if needed. `npm run staff` adds staff accounts to an existing database without rebuilding it, and `npm run set-role <email> <role>` modifies an existing account's role.

---

## Taking payment

The shop takes payment through **Razorpay's Standard Checkout** — UPI, cards, netbanking, wallets and No Cost EMI on Razorpay's own secure page — and cash on delivery.

### The keys

Two keys, both read from the environment and never written into the source:

| Variable | What it is | Where it goes |
|---|---|---|
| `RAZORPAY_KEY_ID` | The shop's name at the gateway | Read on the server, handed to the checkout |
| `RAZORPAY_KEY_SECRET` | What proves a payment came from the gateway | **The server only. It never reaches the browser.** |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | The same key id for the browser | A fallback only — see below |
| `RAZORPAY_WEBHOOK_SECRET` | What proves a webhook came from the gateway | **The server only.** See the webhook section below |

Put them in `.env.local` (ignored by Git) or in the environment settings of the host. A deployment has no `.env.local`, so on Vercel both keys have to be in **Settings → Environment Variables**, for every environment including Preview.

`NEXT_PUBLIC_RAZORPAY_KEY_ID` is only a fallback. The checkout takes the key id from the shop's own answer to `POST /api/create-order`, so the key that opens the checkout is always the key that can verify the payment. Without it the checkout still works.

> The keys in `.env.local` are **test** keys. They take test payments, not real money. Swap them for the live keys when Razorpay approves the shop, and change `NEXT_PUBLIC_RAZORPAY_KEY_ID` with them.

### Turning live mode on

**Do this after the whole integration has been checked against the mock,
not before.** The mock is a stand-in for Razorpay's API that behaves the
way Razorpay's API does, and the whole payment — the order, the
signature, the webhook, the duplicate payments — is exercised against it
without a rupee changing hands.

**1. Put the live keys in `.env.local.live`** (ignored by Git):

```
RAZORPAY_KEY_ID="rzp_live_..."
RAZORPAY_KEY_SECRET="..."
```

**2. Add the webhook secret.** In Razorpay: **Settings → Webhooks → Add a
new webhook**.

| | |
|---|---|
| **Webhook URL** | `https://consoleseller.in/api/webhooks/razorpay` |
| **Secret** | The one shown when the webhook is created |
| **Events** | `payment.captured` and `payment.failed` |

Put that secret in `.env.local` as `RAZORPAY_WEBHOOK_SECRET`. It is a
*different* secret from the key secret.

**3. Switch the shop over:**

```bash
npm run gateway:mode -- live     # or: npm run gateway:mode -- test
```

The script says what it is about to do, and it will not switch to live
unless the live keys are in `.env.local.live`. `npm run gateway:mode --
show` says which mode the shop is in.

**4. On a deployment**, set these in **Settings → Environment Variables**
for every environment including Preview:

| Variable | |
|---|---|
| `RAZORPAY_KEY_ID` | the live key id |
| `RAZORPAY_KEY_SECRET` | the live key secret |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | the same key id, for the browser |
| `RAZORPAY_WEBHOOK_SECRET` | the webhook secret |
| `RAZORPAY_API_BASE` | `https://api.razorpay.com` |

**5. Check it with real money.** Put a small amount in the basket, pay it
with a real card, and look at the order in the back office: it should be
marked as paid, with the payment reference on it. Then look at Razorpay's
dashboard: the payment should be there too.

**The check scripts refuse to run against live keys** unless
`RAZORPAY_ALLOW_LIVE_TESTS=1` is set, because they make real orders at
the real gateway. A test that creates orders somebody has to pay for, or
cancel, is not a test.

### How a payment goes through

1. **The customer presses "Pay".** The browser sends the checkout details to `POST /api/create-order`.
2. **The shop asks the gateway for an order.** It calls Razorpay's `POST /v1/orders` with the amount **in paise** — the shop keeps its money in rupees, and the conversion happens at that edge and nowhere else. The shop's own order id is the gateway's `receipt`, which is what ties a payment back to the order it belongs to.
3. **The shop writes its own order.** The stock comes off the shelf *before* any money moves: a customer who has paid for a console has to be able to have that console. The order waits for the money — it is not announced until the payment is confirmed.
4. **The gateway's window opens.** Razorpay's `checkout.js` is loaded at the checkout and opens on Razorpay's own site. The card number never reaches this server.
5. **The gateway hands back three things** — the order id, the payment id, and a signature over the two.
6. **The shop checks the signature.** `POST /api/verify-payment` makes the same HMAC-SHA256 the gateway made — `order_id + "|" + payment_id`, signed with the key secret — and compares it in constant time. **A signature that does not match is refused, and nothing is marked as paid.**
7. **The gateway is asked to confirm.** The payment and the order it belongs to are fetched together. The payment has to be captured, it has to belong to the order that was named, and it has to be for the amount the shop's own order says is owed.
8. **The order is marked paid.** The payment reference is written on the order, the customer is told, and the basket is emptied.

### A payment happens once

The same payment can reach the shop twice: the customer's browser retries
after the network wobbles, the browser calls the verification endpoint at
the same moment as the webhook arrives, or the customer taps "Pay" twice.
Each of those is one payment and one order.

**The order is worked out from the attempt.** The browser sends an id for
the attempt with the request to start an order, and the shop mixes it with
the browser's session id and hashes it. The shop's own order id comes out
of that hash, so two requests for the same attempt want the same order —
the second one finds it already there, and the stock is taken once.

**Razorpay's order API has no idempotency of its own.** Its `POST
/v1/orders` makes a new order every time, whatever header is sent with
it, and the extra orders are left behind at the gateway as orphans that
nobody can merge. So the shop does the claiming itself, in
`checkout_attempts`: the first request to write the row owns the attempt
and makes the order, and every other one waits for it to finish and is
answered with the same order. The waiting is bounded — the request that
owns the attempt is one call to the gateway away — and a request that
finds the attempt abandoned takes it over.

**The payment is claimed before the order is marked as paid.** Every
payment the shop acts on is written to `gateway_payments` first, and the
payment id is that row's key. The first request to write it wins; every
later one finds the row already there and leaves the order alone. The
claim and the marking of the order happen in one transaction, so they
cannot come apart.

**A second, different payment for an order that is already paid for is
refused**, not quietly swallowed: it is a second payment, and it is
somebody's money.

### The webhook

A webhook is Razorpay saying "this happened", sent to the shop's own
address. It matters most when the browser is not there to report it: a
customer on a train who loses signal halfway through a payment. The money
still moves, and without a webhook the shop would never know.

**Set it up in the Razorpay dashboard** — Settings → Webhooks → Add a new
webhook:

| | |
|---|---|
| **Webhook URL** | `https://consoleseller.in/api/webhooks/razorpay` |
| **Secret** | Shown when the webhook is created. Put it in `RAZORPAY_WEBHOOK_SECRET`. |
| **Events** | `payment.captured` and `payment.failed` |

The secret is **not** the key secret. It is a separate secret, made in the
dashboard, and it signs the webhook's body. A secret that does one job
should not be able to do the other.

**What the endpoint does, in order:**

1. **The body is read exactly as it arrived** — not parsed and put back
   together. It is signed as it was sent, so the bytes have to be the same
   bytes.
2. **The signature is checked** — HMAC-SHA256 of the body, made with the
   webhook secret, compared in constant time. **A webhook that cannot be
   checked is not acted on at all.**
3. **The delivery is claimed** — every webhook carries an id of its own,
   and Razorpay sends it again if it does not hear back. The id is the
   key of a row in `gateway_events`, so the same webhook arriving three
   times is acted on once.
4. **The payment is checked against Razorpay's own API** — is it captured,
   does it belong to this order, is it the amount the order says is owed.
   The webhook says what happened; Razorpay's API is what proves it.
5. **The order is marked as paid**, the customer is told, and the basket
   is emptied. The notification is deduplicated, so a customer who was
   also told by the browser's own call is not told twice.

Without `RAZORPAY_WEBHOOK_SECRET` the endpoint refuses webhooks rather
than acting on them unchecked. A shop that does not receive webhooks still
takes payments — the browser's own call marks the order paid — it just
cannot hear about a payment whose browser went away.

### If the customer walks away

An order that is waiting for a payment is not a real order: nothing was paid, nothing should be sent, and the stock has to go back on the shelf. When the payment window is closed, the browser calls `POST /api/cancel-pending-order` and the order is put away again.

The order id alone cannot do that — an order id is a receipt, and anyone who has seen one can write it down. The request has to come from the same browser that started the payment, and it has to carry a token signed with the session's own secret. **A payment that has gone through is never touched by that endpoint**: money that has been taken is not the shop's to give back there.

### The endpoints

| Endpoint | What it does | When it fails |
|---|---|---|
| `POST /api/create-order` | Makes the order and asks the gateway for one to pay against | `400` on bad details or an empty basket, `409` when the stock ran out, `503` when the shop has no gateway keys |
| `POST /api/verify-payment` | Checks the signature and the gateway's own record | `400` on a signature that does not match, on missing details, on a payment the gateway does not know, and on an amount that does not match — **and nothing is marked as paid** |
| `POST /api/cancel-pending-order` | Puts away an order that was never paid for | `403` when the request does not come from the browser that made the order, `409` when the order has been paid for |
| `POST /api/webhooks/razorpay` | The gateway saying what happened | `400` on a signature that does not match, `503` when the shop has no webhook secret |

### Checking it

```bash
npm run check:razorpay
npm run check:razorpay:webhook
```

Drives a real browser through the whole payment and checks that a signature
that does not match is refused, that a payment the gateway does not know is
refused, that neither of them marks the order paid, that a good signature
does mark it paid and writes the payment reference on the order, that the
basket is emptied, that the customer is told, that cash on delivery still
works, and that an order left unpaid can only be put away by the browser
that made it. It tidies up after itself: the orders it makes are cancelled
through the back office, so the stock goes back on the shelf.

The second script checks the webhook and the idempotency: that a webhook
with no signature, with the wrong signature, or with a body that was changed
after it was signed is refused and nothing is paid; that a webhook with a
good signature marks the order paid; that the same webhook arriving twice
is acted on once; that a second payment for an order that is already paid
for is refused; and that five requests to start an order at the same moment
make one order and take the stock once.

The payment half needs a mock of the gateway, because a payment has to be
made by something. The shop has to be pointed at it:

```bash
npm run mock:gateway          # in one terminal — it says where it is
RAZORPAY_API_BASE=http://127.0.0.1:9595 npm run dev   # in another
npm run check:razorpay        # in a third
npm run check:razorpay:webhook
```

Both scripts **refuse to run against live keys** unless
`RAZORPAY_ALLOW_LIVE_TESTS=1` is set, because they make real orders at
the real gateway. A test that creates orders somebody has to pay for, or
cancel, is not a test.

Against the real gateway — the order really is made at Razorpay, and the
refusals are the real ones — leave `RAZORPAY_API_BASE` unset and run
`npm run check:razorpay`; the payment half is skipped, because there is
no way to make a payment that the real gateway will accept without paying
for something.

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
| `/order/[id]/return` | 7-day return and replacement request form — photographs and video, uploaded with live progress, kept private |
| `/account` | Customer account dashboard |
| `/account/orders` | Customer order history with 7-day return window indicators |
| `/account/returns` | Customer return & replacement requests list |
| `/account/returns/[id]` | Interactive status timeline, the customer's own evidence, and the option to send more when the shop asks for it |
| `/account/notifications` | Every message the shop has sent about the customer's requests |
| `/contact` | Store contact info, FAQs, and validated inquiry submission |
| `/about` | Store background, mission, and hardware authenticity promise |
| `/privacy-policy` | Customer data handling & privacy guarantees |
| `/terms-of-service` | Standard customer terms of service |
| `/refund-policy` | The 7-calendar-day return, replacement and refund policy, as published |

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
| `/admin/returns` | Every return, replacement and refund request — the whole request list with its counters, filters, and a link to each case. The refund and replacement records are views of this page, and the shop's return policy is set here |
| `/admin/returns/[id]` | One request in full: the claim, the evidence, the customer, the audit log, and every action the back office can take |
| `/admin/returns?view=refunds` | The refund records — every refund with its id, order, request, customer, original payment method, amount, status, date and transaction reference, and the lines it was worked out from |
| `/admin/returns?view=replacements` | The replacement records — every replacement and accessory shipment, with the serials, the courier, the tracking number, and where the parcel has got to |
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

### The email

The shop sends its email through Resend, using Resend's own SDK. The
module is `src/lib/mail.ts`, and it is the only place that knows how a
message leaves the shop.

| |
|---|---|
| `RESEND_API_KEY` | The Resend API key, read from the environment and never written down in the source. It lives in `.env.local` and in Vercel's environment settings |
| `MAIL_FROM` | The sender, written out in full — `Consoleseller Orders <orders@consoleseller.in>`. `consoleseller.in` is verified in Resend |
| `ENQUIRY_NOTIFICATION_EMAIL` | Where the shop's own enquiries are sent. It defaults to `NEXT_PUBLIC_STORE_EMAIL` |

**A message is only ever reported as sent when Resend says it was.** A
refusal from Resend — an unverified sender, a bad address, a quota — is a
failure, and it is recorded as one, with Resend's own reason. The shop
never tells a customer their money is on its way when it is not.

**A message is only ever sent once.** Every message carries a key that
says which event it belongs to — `order:PF123:confirmed`,
`return:RET-ABC:refund_completed` — and that key is written down before
the message goes out. A retry after a failure does not send a second
copy, and Resend is given the same key so that it recognises it too.

**The read state and the email outcome are kept apart.** A message can
be unread on the dashboard and its email can still have gone out, and
the shop needs to be able to tell the two apart.

### Returns, replacements and refunds

The whole of a claim lives in the database, and the back office sees
everything the customer sent.

**The claim.** A customer raises a request from the order page. The form
is driven by the rules for the reason they pick, so it asks for what that
reason actually needs — the delivery date, the serial number where the
unit carries one, the list of missing parts, the description. Everything
is checked again on the server: the order has to belong to the person
making the claim, the delivery date is compared with the order's own
record of it, and a second claim about the same unit is refused.

**The evidence.** Photographs and videos are sent up one at a time, so
the page can show how each file is getting on. What a file *is* is
decided by reading its own bytes, not by the name or the type the browser
sent. The files are written outside the public folder and are fetched
through `/api/returns/[id]/evidence/[fileId]`, which answers to the back
office or to the customer who sent them and to nobody else. Nothing is
served from a guessable URL.

**The alternative.** Where the rules ask for a piece of evidence the
customer cannot send, the form says so and asks them why. The claim still
goes forward, because a genuine claim is never turned away for the want
of a photograph — the reason is recorded on the request and shown to the
back office.

**The records.** A request, its items, its evidence, its history and its
audit log are one case. Beside them:

| Record | What it keeps |
|---|---|
| `return_refunds` | The amount, what it was calculated from, the original payment method, the gateway reference, who approved it, who confirmed it, and when the money actually went back |
| `return_refund_lines` | What each refund is made of — the price the customer paid for each thing, and how many of them |
| `return_refund_events` | Every step a refund took: who raised it, who sent it, what the gateway said, and who confirmed the money had gone back |
| `return_replacements` | The serial that came in, the serial going out, the courier, the tracking number, the dispatch date and where the parcel has got to |
| `return_inspections` | Who inspected the unit, when, what they found, and the serial they read off it |
| `admin_actions` | Every button a member of staff pressed on a request, with who, when, and the status it moved from and to |
| `notifications` | Every message the shop sent about a request, and what became of it |

**The customer is told at every step.** The request being made, the shop
looking at it, evidence being asked for, the decision, the pickup, the
product coming back, the inspection, the replacement going out and
arriving, the refund being raised, paid or refused — each one is a
message on the customer's dashboard, and each one is an email when
the shop has a mail service set up. Every message carries the request
id, the order id and a link to the request, and the same change never
sends the same message twice.

**The shop's return policy is set in the same section.** The window,
whether returns are on at all, the wording the customer is shown, and
whether photographs and a pickup are required are all switches in the
Returns & Refunds panel — they are settings in the database, not
constants in the code, and they can be changed without a deployment.

**A refund is not a refund until the money has moved.** It is *not
initiated*, then *pending*, then *processing*, and only then *completed* —
and completing it needs the transaction reference. The customer is told
the same way, and the customer never sees the shop's internal notes.

### Refunds

The Refunds section of Returns & Refunds is where every refund the shop
has raised is kept.

| Shown | |
|---|---|
| **Refund ID** | The shop's own reference, `RFD-…` |
| **Original Order ID** | The order the money goes back against |
| **Return Request ID** | The claim the refund is for |
| **Customer** | The name, email and phone on the order |
| **Original Payment Method** | How the customer actually paid |
| **Refund Amount** | What is going back, and what it was calculated from |
| **Refund Status** | Not initiated, pending, processing, completed or failed |
| **Refund Date** | When it was raised, and when it was paid |
| **Transaction / Gateway Reference ID** | The gateway's refund id, or the UTR of the payment the shop made by hand |

**The amount is worked out from the order as it was bought** — the price
on the order line, times the quantity that is coming back. It is never
the price on the shelf today, and it may never be more than what the
customer paid. Each refund keeps its lines, so the money can be worked
out again later without having to trust the order as it stands now.

**The money goes back through the gateway it came in by.** The shop
calls Razorpay's documented refund API —
`POST /v1/payments/{payment_id}/refund` — and records what the gateway
answers with. The gateway's own status is what decides whether the
refund is complete: a refund the gateway has not processed is
*processing*, never *completed*.

**A refund goes back through the gateway because the money came in
through it.** Every payment taken at the checkout is written on the
order with the gateway's own reference for it, and that reference is
what the refund is sent against.

**Where the shop cannot use the gateway** — it has not been given the
credentials, or the order carries no gateway payment reference — the
refund is paid by hand. An administrator records the reference of the
payment they actually made, and their name is kept against it. A refund
is never completed without either the gateway's confirmation or that
reference.

**The order has to carry the gateway's own reference for the
payment** — `orders.payment_reference` — or there is nothing for the
gateway to refund against. The checkout writes it down when a payment
provider takes the money.

**A request may only have one refund running at once.** The database
itself refuses a second, so the same money cannot go back twice.

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
| `GET` `PATCH` | `/api/admin/settings` | The store's settings — the backorder policy, and the return policy: the window, whether returns are on, the wording the customer is shown, and whether photographs and a pickup are required |
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

| `GET` `POST` | `/api/returns` | The signed-in customer's own requests; `POST` raises one (`{"orderId":"PF…","type":"replacement","reason":"product_damaged","customerNotes":"…","deliveryDate":"2026-11-01","contactName":"…","contactEmail":"…","uploadIds":["UPL-…"],"items":[…]}`) |
| `GET` `POST` | `/api/returns/[id]` | One request with its evidence and history; `POST` attaches more evidence to a request that is still open |
| `GET` | `/api/returns/[id]/history` | Every status the request has been through, with the date and who made the change |
| `POST` | `/api/returns/evidence` | Send evidence up, before the request is submitted (a form, under `files`); the file is checked by its own bytes, not by what the browser said it was |
| `GET` | `/api/returns/[id]/evidence/[fileId]` | One piece of evidence — a photograph or a video. The back office or the customer who sent it, and nobody else |
| `GET` | `/api/admin/returns` | Every request; `?q=`, `?status=`, `?type=`, `?refunds=1`, `?from=`, `?to=`, `?sort=`, `?page=`, `?limit=` |
| `GET` `PATCH` | `/api/admin/returns/[id]` | One request with its evidence, its history, its refunds, its replacements and its inspections; `PATCH` moves it to another status |
| `POST` | `/api/admin/returns/[id]/decision` | Pick a claim up, approve it, reject it (a reason is required), or ask the customer for more evidence |
| `GET` `POST` | `/api/admin/refunds` | Every refund raised; `POST` raises one (`{"returnId":"RET-…","amount":49999,"paymentMethod":"Original Payment Source"}`) — the amount is in rupees, and it may not be more than what the customer paid |
| `PATCH` | `/api/admin/refunds/[id]` | Move a refund along — `"processing"`, `"completed"` (the transaction reference is required), `"failed"`, or `"not_initiated"` |
| `GET` | `/api/admin/replacements` | Every replacement and accessory shipment; `?q=`, `?status=`, `?from=`, `?to=` |
| `PATCH` | `/api/admin/replacements/[id]` | Record where a shipment has got to |

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

### The hero on a phone

A phone gets a hero of its own. A wide screen is a landscape frame and a
phone is not, so a photograph cut for one is cropped badly in the other — a
console with its shelf cut away, a face taken off the frame, a film that is
mostly black once it is cut to a portrait shape. Each slide therefore
carries a picture of its own for a phone, and the first slide carries a film
of its own as well, cut to the shape a phone shows it in.

The two never meet. The wide picture and the wide film are not painted on a
phone, and the phone's picture and film are not painted on a wide screen —
and neither of the films is ever fetched on the screen it does not belong
to, so a phone never downloads the wide film and a desktop never downloads
the phone's.

The pictures are kept apart by a **`<picture>` element**, not by two images
and a CSS rule. Two `<img>` elements side by side are both fetched — the
browser fetches a picture it cannot see, and only the CSS decides which one
is painted — so a phone would carry half a megabyte of landscape
photographs it never shows. With a `<picture>`, the browser reads the media
query itself and fetches the one that fits the screen it is on, before
anything is painted. A phone fetches five files from `/hero/`; a desktop
fetches five.

The pieces are:

| | |
|---|---|
| `hero_slides.mobile_image` | The picture for a phone. Its own key in `data/hero-images.json`. |
| `hero_slides.mobile_alt` | The description of that picture. It is a different photograph, so it is described differently. |
| `hero_slides.mobile_position` | Where that picture is cropped to. Its own frame. |
| `hero_slides.mobile_video` | The film for a phone. A separate file, cut to a phone's shape. |
| `hero_slides.mobile_video_poster` | That film's own first frame. |

The phone's film is encoded by `npm run encode:hero:mobile` and its poster
by `npm run hero:posters:mobile`; `npm run hero:build` does both films and
both sets of posters. The phone's film is cut from the same master as the
wide one, starting a second later so that it does not open on the fade up
from black, and it is trimmed to 1080x1434 — the shape of a phone's frame.

A slide that names no picture for a phone shows the wide one there instead,
so nothing is left blank.

To point the hero at a different picture or film, edit `data/hero.json`,
then:

```bash
npm run sync-hero        # the SQLite seed file
npm run sync-hero:live   # the shop's own database
```

`npm run sync-hero:live` touches the `hero_slides` table and nothing else,
and adds the columns above if the database does not have them yet.

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
  store.db              ← the SQLite file the seed writes and the migration reads
scripts/
  fetch-images.mjs      ← downloads the product photography
  seed.mjs              ← loads catalog.json + hero.json into the SQLite file
  migrate-to-postgres.mjs ← moves that file into PostgreSQL, the shop's database
  check-database.mjs    ← checks the database is there and holds together
  check-async.mjs       ← checks every query is waited for
  sync-hero.mjs         ← refreshes just the hero slides
  sync-categories.mjs   ← refreshes just the category rows
  sync-variants.mjs     ← refreshes what each product varies by
  staff.mjs             ← the demo admin and support accounts
  create-staff.mjs      ← adds those accounts to an existing database
  set-role.mjs          ← changes an account's role
  write-schema.mjs      ← regenerates schema.sql from src/lib/schema.ts
  lib/browser.mjs       ← the headless-Chrome driver the test scripts share
  lib/mock-gateway.mjs  ← a mock of the gateway's API, for testing the payment
  e2e.mjs               ← browser test suite
  check-admin.mjs       ← back-office smoke test
  check-catalogue.mjs   ← catalogue test
  check-inventory.mjs   ← stock and order test
  check-variations.mjs  ← variations and purchasing test
  check-taxonomy.mjs    ← categories, subcategories, brands and specifications test
  check-import.mjs      ← import, export, validation and dashboard test
  check-pages.mjs       ← opens every page and reports what the browser complains about
  check-product-form.mjs ← product editor test
  check-razorpay.mjs    ← the payment, end to end
  cleanup-razorpay-orders.mjs ← puts away the orders the payment check made
  screenshot.mjs        ← single-page screenshot helper
src/
  app/
    (shop)/             ← routes that get the site header and footer
      shop/ about/ contact/
      account/          ← the customer panel: overview, orders, addresses, profile
    admin/              ← the back office: overview, orders, inventory, messages, users, products
    api/admin/          ← back-office JSON endpoints
    api/account/        ← the signed-in customer's own endpoints
    api/create-order/   ← starts an order, and asks the gateway for one to pay against
    api/verify-payment/ ← checks the gateway's signature before an order is marked paid
    api/cancel-pending-order/ ← puts away an order that was never paid for
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
    checkout.ts         ← what the customer fills in, and what the shop does with it
    gateway-config.ts   ← the gateway's keys and its address (no database)
    payment-gateway.ts  ← taking a payment and checking the gateway's signature
    payment-method.ts   ← how a payment method is written for a person to read (no database)
    pending-order.ts    ← the token that lets a browser put away its own unpaid order
    refund-gateway.ts   ← sending a refund back through the gateway
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

`src/lib/db.ts` reaches the database driver, which cannot be pulled into a
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

- **Payments go through Razorpay's test keys.** The checkout takes a real
  payment through Razorpay's Standard Checkout, and the signature is checked
  on the server before anything is marked as paid. The keys in `.env.local`
  are test keys, so they take test payments and not real money. Swapping them
  for the live keys is the only change needed to take real money.
- **There is no webhook.** The shop finds out that a payment went through
  because the customer's browser tells it, and it checks the gateway's own
  record before believing it. That is enough for a payment the customer
  started, but a payment that goes through in some other way — or one the
  browser never reports — would be missed. A webhook on Razorpay's side
  would cover that.
- **Email goes through Resend.** The shop sends every message — about a
  return, a replacement and a refund, and about the order itself — through
  Resend's API, using Resend's own SDK. Every message is written to
  the database first and shown on the customer's dashboard, and the
  email goes out afterwards; what became of the email is recorded beside
  it, so the shop always knows whether a message really went. Without
  `RESEND_API_KEY` the messages are still recorded and still shown — they
  are simply marked as not sent.
- **An enquiry is saved whether or not the email goes out.** The enquiry is
  in the back office's Enquiries section first, and the notification is
  sent after it. What became of the notification is recorded against the
  enquiry — `sent`, `not_configured` or `failed` — and one that did not
  go out can be sent again from the Enquiries section. The shop's
  address for them is `ENQUIRY_NOTIFICATION_EMAIL`, and it defaults to
  `NEXT_PUBLIC_STORE_EMAIL`.
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
- Add a Razorpay webhook, so a payment is picked up even when the customer's
  browser never reports it.
- Move the enquiries queue into a support inbox when the support role is
  settled — the `contact_messages.status` column is already there for it.
