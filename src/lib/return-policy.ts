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

/**
 * How long a customer has to raise a case, in calendar days.
 *
 * The window runs from the day the parcel was delivered, not from the
 * day the order was placed or paid for, and it is the same for every
 * kind of claim. Five days is the shop's published maximum: the back
 * office may publish a shorter window, never a longer one.
 */
export const RETURN_WINDOW_DAYS = 5;

/**
 * The longest window the shop may publish.
 *
 * The back office can bring the window down — a shorter window is
 * kinder to the customer and easier to honour — but it can never be
 * pushed past the published maximum.
 */
export const RETURN_WINDOW_MAX_DAYS = 5;

/** The key the return window duration (in days) is stored under. */
export const RETURN_WINDOW_SETTING = "return_window_days";

/**
 * Whether a product may be sent back.
 *
 * A product carries a note about what the shop does if something goes
 * wrong, and these two words in that note are a refusal: everything else
 * — including a note that says nothing at all — is a product that may be
 * sent back.
 *
 * The rule is here rather than in the code that reads the product, so that
 * the back office's switch and the shop's own answer to a customer are
 * the same rule.
 */
export function isReturnableNote(note: string | null | undefined): boolean {
  const value = String(note ?? "").trim().toLowerCase();
  return value !== "non-returnable" && value !== "no";
}

/**
 * The key that records the published window having been applied.
 *
 * It is what stops the migration from fighting the back office: once the
 * window has been brought onto the policy, a window set by a person is
 * left alone.
 */
export const RETURN_WINDOW_POLICY_MARKER = "return_window_policy_applied";

/**
 * The revision of the published window the shop is on.
 *
 * The marker above only says that a window has been applied once. The
 * revision says *which* window was applied, so that when the published
 * window changes — from seven days to five — the database is brought
 * onto it exactly once, and never fought with afterwards.
 */
export const RETURN_WINDOW_POLICY_REVISION = "5";

/** The key the applied window revision is stored under. */
export const RETURN_WINDOW_REVISION_SETTING = "return_window_policy_revision";

/**
 * What the customer is told once the window has closed.
 *
 * The same sentence is used on the order page, on the request form and
 * in the refusal the server sends, so the customer reads the same rule
 * wherever they meet it. The number in it is the window that is
 * actually in force, which the back office may have made shorter than
 * the published maximum.
 */
export function returnWindowExpiredNotice(windowDays: number): string {
  return `The return and replacement period for this order has expired. Requests can only be submitted within ${windowDays} days of delivery.`;
}

/**
 * What the customer is told about their money once a return is approved.
 *
 * A refund is only raised after the unit has come back and been looked
 * at, and it only reaches the customer's account once the payment
 * provider has moved it. Both halves of that are said here, so the
 * customer is not left wondering where the money is.
 */
export const REFUND_TIMELINE_NOTICE =
  "Once your returned product has been received and successfully inspected, your refund will be processed. The refunded amount should reflect in your original payment account within 3–4 business days after refund processing, depending on your bank or payment provider.";

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
  /**
   * Whether the claim can be made at all without this piece of evidence.
   *
   * Most evidence is asked for, and a claim is still looked at when it
   * is missing — the customer is asked why, and the reason is recorded
   * against the request. A mandatory item is different: there is
   * nothing to assess without it, so the request is refused until it
   * arrives. A unit that arrived broken, or a unit that does not work,
   * cannot be judged without the photographs and the video that show it.
   */
  mandatory?: boolean;
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
 * Evidence for a unit that arrived damaged, or that is not the unit
 * that was ordered.
 *
 * The customer did not open this one — the shop did, on the way here.
 * The only record of how the parcel actually arrived is what the
 * customer filmed while opening it, so the continuous unboxing video is
 * what the claim is judged on. Without it, and without the photographs
 * that go with it, there is nothing to assess.
 */
const DAMAGED_ON_ARRIVAL_EVIDENCE: EvidenceItem[] = [
  {
    id: "product_photos",
    label: "Clear photographs showing the damage",
    required: true,
    mandatory: true,
    hint: "The fault itself, in focus, in good light.",
  },
  {
    id: "package_photos",
    label: "Clear photographs of the packaging the unit arrived in",
    required: true,
    mandatory: true,
    hint: "The outer box and any internal packaging, including any damage to them.",
  },
  {
    id: "unboxing_video",
    label:
      "An unboxing video, recorded continuously while you open the original sealed package",
    required: true,
    mandatory: true,
    hint:
      "One continuous take. It must show the original packaging and the intact seal before you open it, and the damage once the unit is out. A claim about a unit that arrived damaged cannot be taken without it.",
  },
  {
    id: "serial_photo",
    label: "Photograph of the product serial number, wherever applicable",
    required: false,
    hint: "On the underside of a console or controller, if the unit carries one.",
  },
  ...ORDER_AND_DESCRIPTION,
];

/**
 * Evidence for a unit that does not work, or is faulty.
 *
 * This one has been opened — it has to have been, for the fault to be
 * found — so what is asked for is the fault itself: photographs of it,
 * and a video that shows it happening.
 */
const DEFECT_EVIDENCE: EvidenceItem[] = [
  {
    id: "product_photos",
    label: "Clear photographs of the fault",
    required: true,
    mandatory: true,
    hint: "The fault itself, in focus, in good light.",
  },
  {
    id: "issue_video",
    label: "A video showing the fault — the unit not working",
    required: true,
    mandatory: true,
    hint:
      "Show the unit being used and the fault happening. A claim that a unit does not work cannot be taken without a video of it.",
  },
  {
    id: "serial_photo",
    label: "Photograph of the product serial number, wherever applicable",
    required: false,
    hint: "On the underside of a console or controller, if the unit carries one.",
  },
  {
    id: "unboxing_video",
    label: "Unboxing video, if you recorded one",
    required: false,
    hint:
      "Helpful, and it settles a dispute faster — but it is not a condition of this claim.",
  },
  ...ORDER_AND_DESCRIPTION,
];

/**
 * Evidence for a unit that is not as it was described.
 *
 * This is the claim a person looks at, so the evidence is asked for
 * rather than required. If the customer cannot send it, they say why
 * and the claim goes forward.
 */
const MISDESCRIBED_EVIDENCE: EvidenceItem[] = [
  {
    id: "product_photos",
    label: "Clear photographs of the unit as it arrived",
    required: true,
    hint: "The unit as it is, in good light.",
  },
  {
    id: "issue_video",
    label: "A short video of the unit, if you have one",
    required: false,
    hint: "Helpful, and not a condition of the claim.",
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
    evidence: DAMAGED_ON_ARRIVAL_EVIDENCE,
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
    evidence: DEFECT_EVIDENCE,
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
    evidence: DEFECT_EVIDENCE,
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
    evidence: DAMAGED_ON_ARRIVAL_EVIDENCE,
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
    evidence: MISDESCRIBED_EVIDENCE,
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
    case "issue_video":
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
 * The evidence a claim is still waiting for.
 *
 * This is the one place that works it out, and the customer form, the
 * server and the back office all ask it the same question — so they
 * cannot disagree about what a claim is missing.
 *
 * The order and the description are not in the list: they are checked
 * on their own, because they are words rather than files.
 */
export function missingEvidenceFor(
  policy: ReasonPolicy,
  onFile: EvidenceOnFile
): EvidenceItem[] {
  return policy.evidence.filter((e) => {
    if (!e.required) return false;
    if (e.id === "order_id" || e.id === "description") return false;
    return !evidenceSatisfied(e, onFile);
  });
}

/**
 * The evidence a claim cannot go ahead without.
 *
 * Where a claim is about a unit that arrived broken, or one that does
 * not work, there is nothing to assess without the photographs and the
 * video. These are refused on the server, in the form, and again when
 * the back office tries to approve the claim.
 */
export function mandatoryEvidenceFor(
  policy: ReasonPolicy,
  onFile: EvidenceOnFile
): EvidenceItem[] {
  return missingEvidenceFor(policy, onFile).filter((e) => e.mandatory);
}

/**
 * What a file is evidence of, by default, for a given reason.
 *
 * A claim about a unit that arrived broken is shown by the unboxing
 * video; a claim about a unit that does not work is shown by the fault
 * itself. The customer can still change it before every upload.
 */
export function defaultEvidenceKindFor(policy: ReasonPolicy): string {
  if (policy.evidence.some((e) => e.id === "unboxing_video" && e.mandatory)) {
    return "unboxing";
  }
  if (policy.evidence.some((e) => e.id === "issue_video" && e.mandatory)) {
    return "issue";
  }
  return "product";
}

/**
 * What the customer is told when a claim is missing evidence it cannot
 * go ahead without.
 */
export function mandatoryEvidenceNotice(items: EvidenceItem[]): string {
  const labels = items.map((i) => i.label.toLowerCase());
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `This request cannot be accepted without ${list}. Please add it and submit the request again.`;
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
 * to refuse the claim — except where the rules say it is a condition of
 * the claim, which this wording leaves room for.
 */
export const EVIDENCE_REQUEST_NOTICE =
  "We need the photographs and the description below before we can move this on. If you cannot send one of them, tell us why and we will look at the claim on what we have.";
