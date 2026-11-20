/**
 * A stand-in for `next/headers`, for the scripts.
 *
 * A few of the shop's modules read the request's cookies. Outside the
 * app there is no request, so this hands back an empty one — which is
 * exactly what those modules see when nobody is signed in.
 *
 * A script that needs to act as somebody who *is* signed in says so with
 * PF_TEST_COOKIE, which holds the cookie as the browser would send it:
 *
 *   PF_TEST_COOKIE="pf_auth=<the signed value>" node scripts/...
 *
 * It is only ever a stand-in: the app itself never loads this file.
 */

/**
 * The cookie the script is pretending to be holding.
 *
 * It is read each time the cookies are asked for, so that a script can
 * act as one person and then as another.
 */
function pretendedCookie(name) {
  const raw = process.env.PF_TEST_COOKIE ?? "";
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return { name: key, value: rest.join("=") };
  }
  return undefined;
}

/** The cookies of a request that does not exist. */
export function cookies() {
  return Promise.resolve({
    get: (name) => pretendedCookie(name),
    getAll: () => [],
    has: (name) => Boolean(pretendedCookie(name)),
    set: () => undefined,
    delete: () => undefined,
  });
}

/** The headers of a request that does not exist. */
export function headers() {
  return Promise.resolve(new Headers());
}

/** The request's URL, when there is one. */
export function draftMode() {
  return Promise.resolve({ isEnabled: false, enable() {}, disable() {} });
}
