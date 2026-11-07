import { createAddress, listAddresses } from "@/lib/addresses";
import { fail, json, requireApiUser } from "@/lib/api";

/** GET /api/account/addresses — the customer's saved addresses. */
export async function GET() {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  return json({ addresses: await listAddresses(guard.user.id) });
}

/** POST /api/account/addresses — save a new address. */
export async function POST(request: Request) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  let body: Record<string, string>;
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    return fail("Send a JSON body.", 400);
  }

  const required = ["name", "phone", "address1", "city", "state", "pincode"];
  for (const key of required) {
    if (!body[key]?.trim()) return fail(`Missing ${key}.`, 400);
  }
  if (!/^[0-9]{6}$/.test(body.pincode.trim())) {
    return fail("PIN code must be 6 digits.", 400);
  }

  const address = await createAddress(guard.user.id, {
    label: body.label?.trim() || "Home",
    name: body.name,
    phone: body.phone,
    address1: body.address1,
    address2: body.address2,
    city: body.city,
    state: body.state,
    pincode: body.pincode,
    isDefault: body.isDefault === "on" || body.isDefault === "true",
  });

  return json(address, 201);
}
