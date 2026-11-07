/**
 * The rules a return is judged against.
 *
 * This is deliberately its own module with no database import: the
 * customer form, the back office and the policy page all need these
 * rules, and pulling `node:sqlite` into a browser bundle is not
 * something the bundler can do.
 *
 * The rules here are the shop's published policy — they say what a
 * customer may ask for, what we have to see before a case can move, and
 * which remedy is the right one. They are written so that a genuine
 * complaint is never turned away by a technicality: where evidence is
 * recommended rather than required, it is marked as such, and the
 * statutory rights of the customer are never narrowed by anything in
 * this file.
 */

/** How long a customer has to raise a case, in calendar days. */
export const RETURN_WINDOW_DAYS = 7;

/** The key the return window duration (in days) is stored under. */
export const RETURN_WINDOW_SETTING = "return_window_days";

/**
 * The key that records the published window having been applied.
 *
 * It is what stops the migration from fighting the back office: once the
 * window has been brought onto the policy, a window set by a person is
 * left alone.
 */
export const RETURN_WINDOW_POLICY_MARKER = "return_window_policy_applied";

/**
 * What kind of claim a reason is.
 *
 * `damage` covers anything that arrived broken, faulty, wrong or
 * misrepresented. `change_of_mind` is the voluntary return, which is
 * only available on a sealed, untouched unit. `missing_accessories` is
 * the incomplete box. `other` is everything else, and is looked at by a
 * person.
 */
export type ClaimKind =
  | "damage"
  | "change_of_mind"
  | "missing_accessories"
  | "other";

/** The remedy that is offered first, when there is a choice. */
export type PreferredRemedy = "replacement" | "refund" | "accessories";

/**
 * One piece of evidence the customer is asked for.
 *
 * `required` means the case cannot move forward without it. Evidence
 * that is merely useful is marked as not required, and a claim is never
 * turned away for want of it — that is the difference between asking for
 * something and making a condition of the claim.
 */
export type EvidenceItem = {
  id: string;
  label: string;
  required: boolean;
  /** The line of explanation under the item. */
  hint: string;
};

/** Everything the shop knows about one reason. */
export type ReasonPolicy = {
  value: string;
  label: string;
  kind: ClaimKind;
  /** One line for the customer form. */
  summary: string;
  /** The remedy that is offered first. */
  preferredRemedy: PreferredRemedy;
  /** Whether a refund can be given at all. */
  allowRefund: boolean;
  /** Whether a replacement unit can be given. */
  allowReplacement: boolean;
  /**
   * Whether the unit has to arrive sealed, with the manufacturer's
   * seals intact, never activated, registered or used.
   */
  requiresSealed: boolean;
  /** What the customer is asked to send us. */
  evidence: EvidenceItem[];
};

/**
 * The evidence every claim needs: the order is already known, and the
 * customer has to say what is wrong.
 */
const ORDER_AND_DESCRIPTION: EvidenceItem[] = [
  {
    id: "order_id",
    label: "Order ID",
    required: true,
    hint: "On your order confirmation. We fill this in for you.",
  },
  {
    id: "description",
    label: "Description of the problem",
    required: true,
    hint: "What is wrong, and what you expected instead.",
  },
];

/**
 * Evidence for a unit that arrived damaged, faulty, wrong or
 * misrepresented.
 *
 * The unboxing video is recommended rather than required, and it is
 * marked as such: a genuine damage or wrong-item claim is never refused
 * only because the customer could not record one. Packaging that has
 * been opened to look at the product is not held against the customer
 * either.
 */
const DAMAGE_EVIDENCE: EvidenceItem[] = [
  {
    id: "product_photos",
    label: "Clear photographs of the damaged or defective product",
    required: true,
    hint: "The fault itself, in focus, in good light.",
  },
  {
    id: "package_photos",
    label: "Clear photographs of the shipping package",
    required: true,
    hint: "The outer box and any internal packaging, including any damage to them.",
  },
  {
    id: "serial_photo",
    label: "Photograph of the product serial number, wherever applicable",
    required: false,
    hint: "On the underside of a console or controller, if the unit carries one.",
  },
  {
    id: "unboxing_video",
    label: "Unboxing video",
    required: false,
    hint: "Strongly recommended, and it settles a dispute faster. A claim is never refused only because there is no video.",
  },
  ...ORDER_AND_DESCRIPTION,
];

/**
 * Evidence for a voluntary change-of-mind return.
 *
 * The unit has to be sealed and untouched, and we have to be able to see
 * that it is: the photographs of every side and the continuous video are
 * what the inspection is checked against when the parcel arrives.
 */
const SEALED_EVIDENCE: EvidenceItem[] = [
  {
    id: "sealed_photos",
    label: "Clear photographs of all sides of the sealed package",
    required: true,
    hint: "Every side, with the manufacturer's seals visible.",
  },
  {
    id: "sealed_video",
    label: "A continuous video showing the sealed product and its condition",
    required: true,
    hint: "One continuous take, showing the seals and all sides.",
  },
  ...ORDER_AND_DESCRIPTION,
];

/**
 * Evidence for an incomplete box.
 */
const ACCESSORY_EVIDENCE: EvidenceItem[] = [
  {
    id: "product_photos",
    label: "Photographs of the product",
    required: true,
    hint: "The unit and everything that was in the box.",
  },
  {
    id: "package_photos",
    label: "Photographs of the package",
    required: true,
    hint: "The outer box and the internal packaging, as they arrived.",
  },
  {
    id: "missing_list",
    label: "List of the missing accessories",
    required: true,
    hint: "Which parts are missing, and what should have been in the box.",
  },
  {
    id: "unboxing_video",
    label: "Unboxing video, if you have one",
    required: false,
    hint: "Helpful, and not a condition of the claim.",
  },
  ...ORDER_AND_DESCRIPTION,
];

/**
 * The rules, by reason.
 */
export const REASON_POLICIES: ReasonPolicy[] = [
  {
    value: "product_damaged",
    label: "Product arrived damaged",
    kind: "damage",
    summary:
      "The unit arrived physically damaged, or was damaged in transit. A replacement is the first remedy we look at.",
    preferredRemedy: "replacement",
    allowRefund: true,
    allowReplacement: true,
    requiresSealed: false,
    evidence: DAMAGE_EVIDENCE,
  },
  {
    value: "product_not_working",
    label: "Product does not work",
    kind: "damage",
    summary:
      "The unit does not function properly. A replacement is the first remedy we look at.",
    preferredRemedy: "replacement",
    allowRefund: true,
    allowReplacement: true,
    requiresSealed: false,
    evidence: DAMAGE_EVIDENCE,
  },
  {
    value: "defective_product",
    label: "Product is defective",
    kind: "damage",
    summary:
      "The unit is faulty or does not do what it should. A replacement is the first remedy we look at.",
    preferredRemedy: "replacement",
    allowRefund: true,
    allowReplacement: true,
    requiresSealed: false,
    evidence: DAMAGE_EVIDENCE,
  },
  {
    value: "wrong_product_received",
    label: "Wrong product received",
    kind: "damage",
    summary:
      "Something other than what was ordered arrived. A replacement is the first remedy we look at.",
    preferredRemedy: "replacement",
    allowRefund: true,
    allowReplacement: true,
    requiresSealed: false,
    evidence: DAMAGE_EVIDENCE,
  },
  {
    value: "different_from_description",
    label: "Different from the description",
    kind: "damage",
    summary:
      "The unit is not as described. A replacement is the first remedy we look at.",
    preferredRemedy: "replacement",
    allowRefund: true,
    allowReplacement: true,
    requiresSealed: false,
    evidence: DAMAGE_EVIDENCE,
  },
  {
    value: "missing_parts",
    label: "Missing accessories",
    kind: "missing_accessories",
    summary:
      "Something listed in the box never arrived. We send the missing parts to you.",
    preferredRemedy: "accessories",
    allowRefund: false,
    allowReplacement: false,
    requiresSealed: false,
    evidence: ACCESSORY_EVIDENCE,
  },
  {
    value: "change_of_mind",
    label: "Changed my mind — the unit is sealed and unused",
    kind: "change_of_mind",
    summary:
      "A voluntary return. The unit has to be completely sealed, unused and with every accessory and document still in the box.",
    preferredRemedy: "refund",
    allowRefund: true,
    allowReplacement: false,
    requiresSealed: true,
    evidence: SEALED_EVIDENCE,
  },
  {
    value: "other",
    label: "Something else",
    kind: "other",
    summary:
      "Tell us what happened and a person will look at it.",
    preferredRemedy: "refund",
    allowRefund: true,
    allowReplacement: true,
    requiresSealed: false,
    evidence: [
      {
        id: "description",
        label: "Description of the problem",
        required: true,
        hint: "As much detail as you can give us.",
      },
    ],
  },
];

/**
 * The rules for one reason. Anything we do not recognise falls back to
 * the catch-all, so a request is never refused for a reason the shop
 * has not thought about — it is simply looked at by a person.
 */
export function policyForReason(reason: string): ReasonPolicy {
  const found = REASON_POLICIES.find((p) => p.value === reason);
  if (found) return found;
  return REASON_POLICIES[REASON_POLICIES.length - 1];
}

/**
 * What has actually arrived with a claim.
 *
 * The back office reads this to see, at a glance, whether a claim has
 * what it needs. It is deliberately generous: a photograph of the
 * product and a photograph of the packaging are counted together,
 * because a customer who has sent photographs has sent them, and it is
 * for the person looking at the case to say which photograph is which.
 */
export type EvidenceOnFile = {
  photographs: number;
  videos: number;
  description: boolean;
  serialNumber: boolean;
  missingList: boolean;
};

/**
 * Whether one piece of evidence has arrived.
 */
export function evidenceSatisfied(
  item: EvidenceItem,
  onFile: EvidenceOnFile
): boolean {
  switch (item.id) {
    case "order_id":
      return true;
    case "description":
      return onFile.description;
    case "serial_photo":
      return onFile.serialNumber;
    case "missing_list":
      return onFile.missingList;
    case "unboxing_video":
    case "sealed_video":
      return onFile.videos > 0;
    case "product_photos":
    case "package_photos":
    case "sealed_photos":
      return onFile.photographs > 0;
    default:
      return true;
  }
}

/**
 * Whether a request may be made under these rules, and why not.
 *
 * The form shows the customer what is allowed, and the server checks the
 * same thing again. The two cannot disagree, because they are the same
 * function.
 *
 * A refusal here is never about a technicality. A remedy the rules do
 * not offer is refused; a unit that is not sealed is refused for a
 * voluntary return, with the routes that do apply offered instead.
 */
export function checkRequestAllowed(input: {
  reason: string;
  type: string;
  sealedConfirmed: boolean;
}): { ok: boolean; message?: string } {
  const policy = policyForReason(input.reason);

  if (input.type === "replacement" && !policy.allowReplacement) {
    return {
      ok: false,
      message:
        "A replacement unit is not offered for this request. " + policy.summary,
    };
  }
  if (input.type === "return" && !policy.allowRefund) {
    return {
      ok: false,
      message: "A refund is not offered for this request. " + policy.summary,
    };
  }
  if (input.type === "accessories" && policy.preferredRemedy !== "accessories") {
    return {
      ok: false,
      message:
        "Sending the missing parts is not the remedy for this request. " +
        policy.summary,
    };
  }
  if (policy.requiresSealed && !input.sealedConfirmed) {
    return { ok: false, message: SEALED_REQUIRED_NOTICE };
  }

  return { ok: true };
}

/**
 * The wording for a claim whose unit is not sealed.
 *
 * A voluntary return is only available on a sealed unit, but a unit that
 * is not sealed may still be damaged, faulty, wrong or incomplete — and
 * those claims are never affected. This is what the customer is told.
 */
export const OPENED_PRODUCT_NOTICE =
  "We do not offer voluntary change-of-mind refunds for a console or controller that has been opened, activated, registered or used. If the unit is damaged, faulty, not what you ordered, or missing parts, raise it under that reason instead — those claims are handled on their own terms and are not affected by this rule.";

/**
 * What the customer is told when a change-of-mind request arrives for a
 * unit that is not sealed.
 */
export const SEALED_REQUIRED_NOTICE =
  "A change-of-mind return is only available while the unit is completely sealed, with the manufacturer's seals intact, and has not been activated, registered or used. Please raise the request under the reason that actually applies to your unit.";

/**
 * The wording for a claim where the evidence has not been sent.
 *
 * A missing piece of evidence is a reason to ask for it, not a reason
 * to refuse the claim — except where the law says otherwise, which is
 * what this wording leaves room for.
 */
export const EVIDENCE_REQUEST_NOTICE =
  "We need the photographs and the description below before we can move this on. If you cannot send one of them, tell us why and we will look at the claim on what we have — a claim is never turned away only because a photograph or an unboxing video is missing.";
