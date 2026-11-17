/**
 * The words the shop uses when it asks for a sign-in.
 *
 * They are here, and not in the module that asks for it, because the
 * browser has to say the same thing: the toast is raised the moment the
 * button is pressed, before the shop has been asked, so that the customer
 * is told at once rather than after a round trip.
 *
 * Nothing here reaches the server, so a button may use it.
 */
export const SIGN_IN_REQUIRED =
  "Please log in to your account before continuing with your purchase.";

/**
 * Where the customer is sent to sign in.
 *
 * The `resume` mark says that there is a purchase waiting for them, so
 * that signing in carries on with what they were doing instead of
 * dropping them somewhere else.
 */
export function signInUrl(next: string): string {
  return `/login?next=${encodeURIComponent(next)}&resume=1`;
}
