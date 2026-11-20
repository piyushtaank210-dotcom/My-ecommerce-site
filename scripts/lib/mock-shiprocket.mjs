/**
 * A mock of the courier's API.
 *
 * Shiprocket does not publish a mock of its own, so this is a small one:
 * enough of the courier for the shop to be exercised end to end without
 * asking the real one for anything.
 *
 * It answers the calls the shop makes:
 *
 *   POST /v1/external/auth/login              — a token
 *   GET  /v1/external/courier/track/awb/:awb  — where a parcel is
 *
 * The shape of what it answers is the shape Shiprocket answers in — the
 * one in Shiprocket's own published collection — so that the shop is
 * proved against the real contract rather than against a convenient one.
 *
 * The mock can also misbehave on purpose, so that the shop's handling of
 * a courier that says no can be exercised: the token can be refused, the
 * sign-in can fail, and the tracking can fall over.
 *
 * Run it on its own:
 *
 *   node scripts/lib/mock-shiprocket.mjs
 *
 * It says where it is on, and it stays until it is stopped.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const DEFAULT_PORT = 9596;

/** The credentials the mock accepts. */
const EMAIL = process.env.MOCK_SHIPROCKET_EMAIL ?? "shiprocket-check@example.invalid";
const PASSWORD =
  process.env.MOCK_SHIPROCKET_PASSWORD ?? "shiprocket-check-secret";

export function startMockShiprocket(port = DEFAULT_PORT) {
  /** The tokens the mock has handed out. */
  const tokens = new Set();
  /** What the mock knows about each parcel, by tracking number. */
  const shipments = new Map();

  /**
   * How the mock is behaving.
   *
   * `failAuth` makes the sign-in refuse, `refuseToken` makes every token
   * the shop holds worthless, and `failTracking` makes the tracking fall
   * over.
   */
  const settings = {
    failAuth: false,
    refuseToken: false,
    failTracking: false,
  };

  /** What the shop has asked for. */
  const calls = {
    /** How many times the shop has signed in. */
    auth: 0,
    /** How many times the shop has asked where a parcel is. */
    tracking: 0,
    /** How many requests the mock turned away for want of a good token. */
    rejected: 0,
    /** The tracking numbers the shop has asked about. */
    awbs: [],
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const json = (status, body) => {
      const text = JSON.stringify(body);
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(text),
      });
      res.end(text);
    };

    /* ---- a token ---- */
    if (req.method === "POST" && url.pathname === "/v1/external/auth/login") {
      const body = await readBody(req);
      calls.auth++;

      if (settings.failAuth) {
        console.log("[mock] refused the sign-in");
        return json(500, { message: "The courier is not able to sign you in." });
      }

      if (body.email !== EMAIL || body.password !== PASSWORD) {
        console.log("[mock] refused the sign-in: wrong credentials");
        return json(401, { message: "The credentials are not right." });
      }

      const token = `tok_${randomBytes(12).toString("hex")}`;
      tokens.add(token);
      console.log("[mock] signed in");
      return json(200, { success: true, token });
    }

    /* ---- where a parcel is ---- */
    const trackMatch = url.pathname.match(
      /^\/v1\/external\/courier\/track\/awb\/(.+)$/
    );
    if (req.method === "GET" && trackMatch) {
      const awb = decodeURIComponent(trackMatch[1]);
      calls.tracking++;
      calls.awbs.push(awb);

      const bearer = String(req.headers.authorization ?? "");
      const offered = bearer.replace(/^Bearer\s+/i, "").trim();
      if (settings.refuseToken || !offered || !tokens.has(offered)) {
        calls.rejected++;
        console.log("[mock] turned away the request for a good token");
        return json(401, { message: "The token is not right." });
      }

      if (settings.failTracking) {
        console.log("[mock] the tracking fell over");
        return json(500, { message: "The courier could not answer." });
      }

      const fixture = shipments.get(awb);
      if (!fixture) {
        console.log(`[mock] there is no parcel ${awb}`);
        return json(404, { message: "There is no such parcel." });
      }

      console.log(`[mock] told the shop where ${awb} is`);
      return json(200, buildTracking(awb, fixture));
    }

    return json(404, { message: "No such thing" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const { port: on } = server.address();
      resolve({
        base: `http://127.0.0.1:${on}`,
        email: EMAIL,
        password: PASSWORD,
        tokens,
        shipments,
        settings,
        calls,
        /** Tells the mock about a parcel. */
        setTracking(awb, fixture) {
          shipments.set(String(awb), fixture);
        },
        /** Throws the token the shop is holding away. */
        expireToken() {
          tokens.clear();
        },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/**
 * The answer, in the shape the courier answers in.
 *
 * It is the shape from the courier's own published collection, so that
 * the shop is proved against the real contract.
 */
function buildTracking(awb, fixture) {
  const events = fixture.events ?? [];

  return {
    tracking_data: {
      track_status: 1,
      shipment_status: fixture.shipmentStatus ?? 7,
      shipment_track: [
        {
          id: fixture.shipmentId ?? 1,
          awb_code: awb,
          courier_company_id: 51,
          shipment_id: fixture.shipmentId ?? 1,
          order_id: fixture.orderId ?? 1,
          pickup_date: fixture.pickupDate ?? null,
          delivered_date: fixture.deliveredDate ?? null,
          weight: "0.30",
          packages: 1,
          current_status: fixture.currentStatus ?? events[0]?.activity ?? null,
          delivered_to: "Ludhiana",
          destination: "Ludhiana",
          consignee_name: "",
          origin: "Bengaluru",
          courier_agent_details: null,
          courier_name: fixture.courierName ?? "Xpressbees Surface",
          edd: fixture.estimatedDelivery ?? null,
          pod: "Available",
          pod_status: null,
        },
      ],
      shipment_track_activities: events.map((event) => ({
        date: event.date,
        status: event.status,
        activity: event.activity,
        location: event.location,
        "sr-status": event.srStatus ?? "",
        "sr-status-label": event.label ?? "",
      })),
    },
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

// Run on its own when this file is the entry point.
if (process.argv[1] && process.argv[1].endsWith("mock-shiprocket.mjs")) {
  const port = Number(process.env.MOCK_PORT ?? DEFAULT_PORT);
  const mock = await startMockShiprocket(port);
  console.log(`the mock courier is on ${mock.base}`);
  console.log("point the shop at it with:");
  console.log(`  SHIPROCKET_API_BASE=${mock.base} npm run dev`);
}
