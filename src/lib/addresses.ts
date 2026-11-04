import { getDb } from "./db";
import type { Address } from "./types";

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v ?? 0);
const strOrNull = (v: unknown) =>
  v === null || v === undefined ? null : String(v);

export type AddressInput = {
  label: string;
  name: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
};

function mapAddress(r: Row): Address {
  return {
    id: num(r.id),
    user_id: num(r.user_id),
    label: str(r.label) || "Home",
    name: str(r.name),
    phone: str(r.phone),
    address1: str(r.address1),
    address2: strOrNull(r.address2),
    city: str(r.city),
    state: str(r.state),
    pincode: str(r.pincode),
    is_default: num(r.is_default) === 1,
    created_at: str(r.created_at),
  };
}

/** The customer's saved addresses, default first. */
export function listAddresses(userId: number): Address[] {
  return (
    getDb()
      .prepare(
        "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC"
      )
      .all(userId) as Row[]
  ).map(mapAddress);
}

export function getAddress(id: number, userId: number): Address | null {
  const row = getDb()
    .prepare("SELECT * FROM addresses WHERE id = ? AND user_id = ?")
    .get(id, userId) as Row | undefined;
  return row ? mapAddress(row) : null;
}

export function getDefaultAddress(userId: number): Address | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC LIMIT 1"
    )
    .get(userId) as Row | undefined;
  return row ? mapAddress(row) : null;
}

export function createAddress(userId: number, input: AddressInput): Address {
  const db = getDb();
  const isFirst = num(
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?")
        .get(userId) as Row | undefined
    )?.n
  ) === 0;

  const makeDefault = input.isDefault || isFirst;

  if (makeDefault) {
    db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(
      userId
    );
  }

  const info = db
    .prepare(
      `INSERT INTO addresses
         (user_id, label, name, phone, address1, address2, city, state, pincode, is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      userId,
      input.label.trim() || "Home",
      input.name.trim(),
      input.phone.trim(),
      input.address1.trim(),
      input.address2?.trim() || null,
      input.city.trim(),
      input.state.trim(),
      input.pincode.trim(),
      makeDefault ? 1 : 0
    );

  const id = Number(info.lastInsertRowid);
  return getAddress(id, userId)!;
}

export function updateAddress(
  id: number,
  userId: number,
  input: AddressInput
): Address | null {
  const db = getDb();
  if (!getAddress(id, userId)) return null;

  if (input.isDefault) {
    db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(
      userId
    );
  }

  db.prepare(
    `UPDATE addresses
     SET label = ?, name = ?, phone = ?, address1 = ?, address2 = ?,
         city = ?, state = ?, pincode = ?, is_default = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    input.label.trim() || "Home",
    input.name.trim(),
    input.phone.trim(),
    input.address1.trim(),
    input.address2?.trim() || null,
    input.city.trim(),
    input.state.trim(),
    input.pincode.trim(),
    input.isDefault ? 1 : 0,
    id,
    userId
  );

  return getAddress(id, userId);
}

export function setDefaultAddress(id: number, userId: number): boolean {
  const db = getDb();
  if (!getAddress(id, userId)) return false;
  db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(userId);
  db.prepare("UPDATE addresses SET is_default = 1 WHERE id = ?").run(id);
  return true;
}

export function deleteAddress(id: number, userId: number): boolean {
  const db = getDb();
  const existing = getAddress(id, userId);
  if (!existing) return false;
  db.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").run(id, userId);
  // If the deleted address was the default, promote the next one.
  if (existing.is_default) {
    const next = db
      .prepare(
        "SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1"
      )
      .get(userId) as Row | undefined;
    if (next) {
      db.prepare("UPDATE addresses SET is_default = 1 WHERE id = ?").run(
        num(next.id)
      );
    }
  }
  return true;
}
