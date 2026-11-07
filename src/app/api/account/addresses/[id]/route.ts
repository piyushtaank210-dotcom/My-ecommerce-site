import { deleteAddress, getAddress, setDefaultAddress, updateAddress } from "@/lib/addresses";
import { fail, json, requireApiUser } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/account/addresses/[id] — edit an address, or make it default. */
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const addressId = Number(id);
  if (!getAddress(addressId, guard.user.id)) {
    return fail("No such address.", 404);
  }

  let body: Record<string, string> & { isDefault?: string | boolean };
  try {
    body = (await request.json()) as Record<string, string> & {
      isDefault?: string | boolean;
    };
  } catch {
    return fail("Send a JSON body.", 400);
  }

  // A bare "make this the default" call carries no address fields.
  if (body.isDefault !== undefined && !body.address1) {
    await setDefaultAddress(addressId, guard.user.id);
    return json(getAddress(addressId, guard.user.id));
  }

  if (!body.address1?.trim() || !body.city?.trim() || !body.pincode?.trim()) {
    return fail("An address needs a street, a city and a PIN code.", 400);
  }

  const updated = await updateAddress(addressId, guard.user.id, {
    label: body.label ?? "Home",
    name: body.name ?? "",
    phone: body.phone ?? "",
    address1: body.address1,
    address2: body.address2,
    city: body.city,
    state: body.state ?? "",
    pincode: body.pincode,
    isDefault:
      body.isDefault === "on" || body.isDefault === "true" ? true : undefined,
  });

  return json(updated);
}

/** DELETE /api/account/addresses/[id] — forget an address. */
export async function DELETE(_request: Request, { params }: Params) {
  const guard = await requireApiUser();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const addressId = Number(id);
  if (!deleteAddress(addressId, guard.user.id)) {
    return fail("No such address.", 404);
  }

  return json({ deleted: addressId });
}
