/**
 * Shiprocket, the courier the shop books with.
 *
 * The shop books its shipments by hand, in Shiprocket's own panel, and
 * this module is only ever used to *read* what Shiprocket knows about a
 * parcel once it is on its way. Nothing here creates a shipment, assigns
 * a courier, books a pickup or cancels anything: the booking is the
 * shop's own work, done by a person, and this module does not touch it.
 *
 * The credentials live in the environment and never leave the server.
 * This module is imported by server code only — it says so out loud, and
 * refuses to run in a browser — so the key and the password can never be
 * pulled into a client bundle.
 *
 * The token
 * ---------
 *
 * Shiprocket issues a JSON Web Token that is good for ten days. It is
 * held in memory: never written down, never sent to the browser, never
 * logged. It is used as `Authorization: Bearer <token>`.
 *
 * A token that is refused is thrown away, a new one is fetched, and the
 * request that was refused is tried once more. That is the whole of the
 * expiry story — the shop does not have to know when a token runs out,
 * because a token that has run out is simply a token that is refused.
 */

/* ------------------------------------------------------------- vocabulary */

/**
 * A plain check that this is server code.
 *
 * A client component that imports this module would pull the key and the
 * password into the browser's bundle, so the module refuses to load in a
 * browser rather than letting it happen quietly.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "The Shiprocket module is server-only: its credentials must never reach the browser."
  );
}

/**
 * One event in a parcel's journey.
 */
export type ShiprocketTrackingEvent = {
  /** The courier's short code for it, such as `DLVD`. */
  status: string | null;
  /** The courier's own label for it, such as `DELIVERED`. */
  statusLabel: string | null;
  /** The sentence the courier gave with it. */
  activity: string | null;
  /** Where it happened. */
  location: string | null;
  /** When it happened, as the courier wrote it. */
  occurredAt: string | null;
};

/**
 * What Shiprocket knows about one parcel.
 *
 * The same shape whichever endpoint the shop's account talks to: Shiprocket
 * has two families of address for the same thing, and both are read into
 * this.
 */
export type ShiprocketTracking = {
  /** The tracking number this is about. */
  awb: string | null;
  /** The courier carrying it, as the courier calls itself. */
  courierName: string | null;
  /** Where the parcel is now, in the courier's words. */
  currentStatus: string | null;
  /** The courier's short code for that. */
  currentStatusCode: string | null;
  /** The courier's label for that. */
  currentStatusLabel: string | null;
  /** Where the parcel is. */
  location: string | null;
  /** When the parcel is expected, when the courier says. */
  estimatedDelivery: string | null;
  /** When the courier collected the parcel. */
  pickedUpAt: string | null;
  /** When the parcel was delivered. */
  deliveredAt: string | null;
  /** Shiprocket's own reference for the shipment. */
  shipmentId: string | null;
  /** The journey, newest first. */
  events: ShiprocketTrackingEvent[];
};

/**
 * Something went wrong at Shiprocket.
 *
 * The message is for the shop's own logs and for the person in the back
 * office: it never carries the key, the password or the token.
 */
export class ShiprocketError extends Error {
  /** The status Shiprocket answered with, when there was one. */
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ShiprocketError";
    this.status = status;
  }
}

/* ------------------------------------------------------------ the settings */

/** Where Shiprocket lives, unless the shop says otherwise. */
const DEFAULT_BASE = "https://apiv2.shiprocket.in";

/**
 * Where the token is fetched from, in the order it is tried.
 *
 * Shiprocket has two families of address for the same API. The one its own
 * documentation gives is tried first; the older one is tried after it, so
 * that an account whose API user was made for the older family still
 * works without the shop having to be told which one it has.
 */
const AUTH_PATHS = ["/v1/external/auth/login", "/auth"];

/** Where the tracking is fetched from, in the order it is tried. */
const TRACK_PATHS = [
  "/v1/external/courier/track/awb/{awb}",
  "/shipments/track/{awb}",
];

/** How long a token is held before a new one is fetched. */
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

/** How long the shop waits for Shiprocket to answer. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Whether the shop has been given Shiprocket's credentials.
 *
 * The back office uses this to say plainly that the tracking cannot be
 * fetched, rather than failing with an empty message.
 */
export function shiprocketConfigured(): boolean {
  return Boolean(
    String(process.env.SHIPROCKET_EMAIL ?? "").trim() &&
      String(process.env.SHIPROCKET_PASSWORD ?? "").trim()
  );
}

/** Where the shop's Shiprocket lives. */
function apiBase(): string {
  const base = String(process.env.SHIPROCKET_API_BASE ?? "").trim();
  return (base || DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * The addresses to try, in order.
 *
 * The shop's own setting comes first when it has one, so that a shop
 * pointed at a different address — a mock, while it is being tested — is
 * never second-guessed by the addresses that follow.
 */
function authPaths(): string[] {
  const own = String(process.env.SHIPROCKET_AUTH_PATH ?? "").trim();
  return own ? [own, ...AUTH_PATHS] : [...AUTH_PATHS];
}

function trackPaths(): string[] {
  const own = String(process.env.SHIPROCKET_TRACK_PATH ?? "").trim();
  return own ? [own, ...TRACK_PATHS] : [...TRACK_PATHS];
}

/* ------------------------------------------------------------------ token */

/**
 * The token the shop is holding, and how long it has left.
 *
 * It is held in memory on the process, not in the database and not on
 * disk: a token is a thing that is valid for ten days, and the shop can
 * fetch another one at any time.
 */
let held: { token: string; expiresAt: number } | null = null;

/**
 * Throws the token away.
 *
 * It is used when Shiprocket refuses one, and by the shop's own tests
 * when they need the next request to fetch a fresh one.
 */
export function resetShiprocketToken(): void {
  held = null;
}

/**
 * Fetches a token, and remembers it.
 *
 * A token that is already held and still good is used as it is; only a
 * new one costs a round trip.
 */
async function fetchToken(): Promise<string> {
  const email = String(process.env.SHIPROCKET_EMAIL ?? "").trim();
  const password = String(process.env.SHIPROCKET_PASSWORD ?? "").trim();

  if (!email || !password) {
    throw new ShiprocketError(
      "Shiprocket has not been given its credentials, so tracking cannot be fetched."
    );
  }

  let lastError: ShiprocketError | null = null;

  for (const path of authPaths()) {
    const url = `${apiBase()}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      lastError =
        lastError ??
        new ShiprocketError(
          `Shiprocket could not be reached: ${err instanceof Error ? err.message : "the connection failed"}`
        );
      continue;
    }

    if (!response.ok) {
      // The credentials were refused. There is no point trying the other
      // address for the same credentials — a wrong key is a wrong key.
      if (response.status === 401 || response.status === 403) {
        throw new ShiprocketError(
          "Shiprocket refused the shop's API credentials.",
          response.status
        );
      }
      // The first answer is the one worth keeping: the addresses that
      // follow are only tried because the first one was not there.
      lastError =
        lastError ??
        new ShiprocketError(
          `The courier would not sign the shop in: it answered with ${response.status}.`,
          response.status
        );
      continue;
    }

    const payload = (await readJson(response)) as Record<string, unknown> | null;
    const token = readToken(payload);
    if (!token) {
      lastError = new ShiprocketError("Shiprocket did not give the shop a token.");
      continue;
    }

    held = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return token;
  }

  throw (
    lastError ??
    new ShiprocketError("Shiprocket could not be reached.")
  );
}

/**
 * The token to use, fetching one if there is not one already.
 */
async function token(force = false): Promise<string> {
  if (!force && held && held.expiresAt > Date.now()) return held.token;
  return fetchToken();
}

/**
 * Reads the token out of what Shiprocket answered.
 *
 * The answer has been seen in more than one shape over the years, so it
 * is looked for in each of them rather than in one place only.
 */
function readToken(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;

  const direct = payload.token ?? payload.access_token ?? payload.jwt;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const data = payload.data;
  if (data && typeof data === "object") {
    const inner = (data as Record<string, unknown>).token;
    if (typeof inner === "string" && inner.trim()) return inner.trim();
  }

  return null;
}

/* --------------------------------------------------------------- requests */

/**
 * Reads a JSON body, without throwing when it is not JSON.
 */
async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Asks Shiprocket for something, with the token on the request.
 *
 * A token that is refused is fetched again and the request is tried once
 * more — that is how a token that ran out mid-morning is dealt with.
 */
async function shiprocketRequest(
  path: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<{ ok: true; payload: unknown } | { ok: false; error: ShiprocketError }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = await token(attempt > 0);

    let response: Response;
    try {
      response = await fetch(`${apiBase()}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${bearer}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      return {
        ok: false,
        error: new ShiprocketError(
          `Shiprocket could not be reached: ${err instanceof Error ? err.message : "the connection failed"}`
        ),
      };
    }

    if (response.status === 401 || response.status === 403) {
      // The token was refused. It is thrown away, and the request is
      // tried again with a new one.
      resetShiprocketToken();
      if (attempt === 0) continue;
      return {
        ok: false,
        error: new ShiprocketError(
          "Shiprocket refused the shop's token.",
          response.status
        ),
      };
    }

    if (response.status === 404) {
      // This address is not one the shop's account has. The next one is
      // tried.
      return {
        ok: false,
        error: new ShiprocketError("Shiprocket has no such address.", 404),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: new ShiprocketError(
          `Shiprocket answered with ${response.status}.`,
          response.status
        ),
      };
    }

    return { ok: true, payload: await readJson(response) };
  }

  return {
    ok: false,
    error: new ShiprocketError("Shiprocket could not be reached."),
  };
}

/* --------------------------------------------------------------- tracking */

/**
 * Fetches what Shiprocket knows about a parcel.
 *
 * The tracking number is the parcel's own. Shiprocket has two families
 * of address for this and both are read, so that the shop does not have
 * to know which family its account talks to.
 */
export async function fetchShiprocketTracking(
  awb: string
): Promise<ShiprocketTracking> {
  const number = String(awb ?? "").trim();
  if (!number) {
    throw new ShiprocketError("There is no tracking number to look up.");
  }

  let lastError: ShiprocketError | null = null;
  let notFound = false;

  for (const template of trackPaths()) {
    const path = template.replace("{awb}", encodeURIComponent(number));
    const result = await shiprocketRequest(path, "GET");

    if (!result.ok) {
      // A missing address means this account does not talk that way; a
      // refusal means something else is wrong and the next address will
      // not help.
      if (result.error.status === 404) {
        lastError = result.error;
        notFound = true;
        continue;
      }
      throw result.error;
    }

    const tracking = readTracking(result.payload, number);
    if (!tracking) {
      throw new ShiprocketError("Shiprocket answered with something unreadable.");
    }
    return tracking;
  }

  // Every address was refused the same way: the courier either does not
  // know the number, or does not answer that way. Either way the shop
  // has nothing to show.
  if (notFound) {
    throw new ShiprocketError(
      "The courier does not know that tracking number.",
      404
    );
  }

  throw lastError ?? new ShiprocketError("Shiprocket could not be reached.");
}

/**
 * Reads what Shiprocket answered into the shop's own shape.
 *
 * The newer answer holds its journey under `shipment_track_activities`;
 * the older one holds it under `tracking_history`. Both are read, and
 * what is left is the same.
 */
export function readTracking(
  payload: unknown,
  awb: string
): ShiprocketTracking | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const data = root.tracking_data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const summary = firstOf(d.shipment_track);
    const summaryRow = (summary ?? {}) as Record<string, unknown>;

    const events = (Array.isArray(d.shipment_track_activities)
      ? d.shipment_track_activities
      : []
    ).map(readActivity);

    const current = events[0] ?? null;

    return {
      awb: text(summaryRow.awb_code) ?? text(summaryRow.awb) ?? awb,
      courierName: text(summaryRow.courier_name),
      currentStatus:
        text(summaryRow.current_status) ?? current?.activity ?? current?.statusLabel,
      currentStatusCode: current?.status ?? null,
      currentStatusLabel: current?.statusLabel ?? null,
      location: current?.location ?? null,
      estimatedDelivery:
        text(summaryRow.edd) ?? text(summaryRow.estimated_delivery_date),
      pickedUpAt: text(summaryRow.pickup_date),
      deliveredAt: text(summaryRow.delivered_date),
      shipmentId: text(summaryRow.shipment_id),
      events: sortNewestFirst(events),
    };
  }

  const tracking = root.tracking;
  if (tracking && typeof tracking === "object") {
    const t = tracking as Record<string, unknown>;

    const events = (Array.isArray(t.tracking_history) ? t.tracking_history : []).map(
      (row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          status: text(r.status),
          statusLabel: null,
          activity: text(r.status_description),
          location: text(r.location),
          occurredAt: text(r.status_date),
        };
      }
    );

    const current =
      events.find((e) => e.occurredAt) ?? events[0] ?? null;

    return {
      awb: text(t.awb) ?? awb,
      courierName: null,
      currentStatus: text(t.status) ?? current?.activity ?? null,
      currentStatusCode: current?.status ?? null,
      currentStatusLabel: null,
      location: text(t.location) ?? current?.location ?? null,
      estimatedDelivery: text(t.estimated_delivery_date),
      pickedUpAt: null,
      deliveredAt: null,
      shipmentId: text(t.shipment_id),
      events: sortNewestFirst(events),
    };
  }

  return null;
}

/**
 * One row of the courier's journey.
 */
function readActivity(row: unknown): ShiprocketTrackingEvent {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    status: text(r.status),
    statusLabel: text(r["sr-status-label"]),
    activity: text(r.activity),
    location: text(r.location),
    occurredAt: text(r.date),
  };
}

/**
 * The first row of a list, when there is one.
 */
function firstOf(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

/**
 * A string, when there is one. Numbers and the like are turned into
 * their own words.
 */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * The journey, newest first.
 *
 * The courier's own order is kept where it gives one, but a parcel whose
 * events carry no date at all would otherwise be in whatever order the
 * courier happened to send them, so a plain reversal is used when none
 * of them do.
 */
function sortNewestFirst(
  events: ShiprocketTrackingEvent[]
): ShiprocketTrackingEvent[] {
  const dated = events.some((e) => e.occurredAt);
  if (!dated) return [...events].reverse();
  return [...events].sort((a, b) => {
    const left = a.occurredAt ? Date.parse(normaliseDate(a.occurredAt)) : 0;
    const right = b.occurredAt ? Date.parse(normaliseDate(b.occurredAt)) : 0;
    if (Number.isNaN(left) && Number.isNaN(right)) return 0;
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return right - left;
  });
}

/**
 * A courier's date, in a form a date can be read from.
 *
 * The courier writes "2022-07-19 11:37:00", which is a date and a time
 * with a space in the middle. It is turned into the shape the shop uses
 * everywhere else.
 */
export function normaliseDate(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw.replace(" ", "T"));
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toISOString();
}

/**
 * The courier's date, read as the shop's own format, or nothing when
 * there is no date.
 */
export function courierDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw.replace(" ", "T"));
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}
