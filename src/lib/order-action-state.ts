/**
 * What an order action says back to the page.
 *
 * It is kept out of the actions file on purpose: a file marked
 * "use server" may only export async functions, and the state an action
 * starts from is not one of them.
 *
 * The message is what the administrator is shown; the field is where the
 * form should point its finger when something is missing; and `done` is
 * what the page uses to know that the action it asked for has finished,
 * so that the form it opened can close itself.
 */
export type OrderActionState = {
  ok: boolean;
  message?: string;
  /** The field that is wrong, when one of them is. */
  field?: string;
  /** Which action finished. */
  done?: "shipping" | "cancel" | "refund" | "refund-status" | "tracking";
};

/** The state every action starts from. */
export const initialOrderActionState: OrderActionState = { ok: false };
