import { NextResponse } from "next/server";
import { staffForApi, userForApi } from "./guard";
import { can, type Permission } from "./roles";
import type { User } from "./auth";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

/**
 * Guards a back-office endpoint. Returns the user, or the response to send
 * back instead — 401 when nobody is signed in, 403 when the role is not
 * allowed.
 */
export async function requireApiPermission(
  permission: Permission
): Promise<{ user: User } | { error: NextResponse }> {
  const user = await staffForApi();
  if (!user) return { error: fail("Sign in to use this endpoint.", 401) };
  if (!can(user.role, permission)) {
    return { error: fail("Your role does not allow this.", 403) };
  }
  return { user };
}

/** Guards an endpoint that only needs a signed-in customer. */
export async function requireApiUser(): Promise<
  { user: User } | { error: NextResponse }
> {
  const user = await userForApi();
  if (!user) return { error: fail("Sign in to use this endpoint.", 401) };
  return { user };
}

/** `?page=2&limit=25` -> the limit and the offset behind it. */
export function pageParams(url: URL) {
  // `Number(null)` is 0, not NaN, so the defaults have to come from `||`.
  const rawLimit = Number(url.searchParams.get("limit")) || 25;
  const rawPage = Number(url.searchParams.get("page")) || 1;
  const limit = Math.min(Math.max(rawLimit, 1), 100);
  const page = Math.max(rawPage, 1);
  return { limit, offset: (page - 1) * limit, page };
}

/** Wraps a page of rows in the envelope the panels expect. */
export function paged<T>(
  rows: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    rows,
    total,
    page,
    limit,
    pages: Math.max(Math.ceil(total / limit), 1),
  };
}
