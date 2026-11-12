/**
 * A stand-in for `next/headers`, for the scripts.
 *
 * A few of the shop's modules read the request's cookies. Outside the
 * app there is no request, so this hands back an empty one — which is
 * exactly what those modules see when nobody is signed in.
 */

/** The cookies of a request that does not exist. */
export function cookies() {
  return Promise.resolve({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
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
