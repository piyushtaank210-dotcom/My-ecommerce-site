import type { Metadata } from "next";
import { PolicyPage, type PolicyDoc } from "@/components/policy/PolicyPage";
import { RETURN_WINDOW_DAYS } from "@/lib/return-policy";

export const metadata: Metadata = {
  title: "Return, Refund and Replacement Rules",
  description:
    "Our rules for damaged, faulty, incorrect and incomplete products, for voluntary returns on a sealed unit, for cancelling an order, and for missing accessories.",
};

const doc: PolicyDoc = {
  title: "Return, Refund and Replacement Rules",
  eyebrow: "Customer Support",
  intro:
    "These are the rules we work to when something is wrong with an order, and the rules we work to when an order is simply not what you wanted. They are set out in full so you know exactly where you stand before you send anything back. They are applied subject to the consumer protection laws that apply in India — nothing in these rules takes away a right you have under those laws, and where the law requires something different from what is written here, the law is what we follow.",
  updated: "November 2026",
  sections: [
    {
      id: "damaged-or-defective",
      heading: "A. Damaged, Defective or Incorrect Products",
      blocks: [
        {
          kind: "p",
          text: "If any of the following is what arrived, tell us. A physically damaged gaming console. A broken controller. A defective product. A product that does not function properly. A wrong product. A product with missing accessories. A product damaged during shipping.",
        },
        {
          kind: "note",
          tone: "brand",
          text: `You must report the issue within ${RETURN_WINDOW_DAYS} calendar days of delivery. The window is the same for every kind of claim in this section.`,
        },
        {
          kind: "h3",
          text: "What to send us",
        },
        {
          kind: "ul",
          items: [
            "An unboxing video showing the original package and its condition.",
            "Clear photographs of the shipping package.",
            "Clear photographs of the damaged or defective product.",
            "A photograph of the product serial number, wherever the unit carries one.",
            "Your order ID.",
            "A description of the problem.",
          ],
        },
        {
          kind: "p",
          text: "The unboxing video is strongly recommended, because it is usually the quickest way for us to see what happened and to settle a disagreement without delay. It is not a condition of the claim. A genuine damage, defect or wrong-item claim is never refused because you could not record an unboxing video, and we will not refuse a claim because the packaging had been opened to look the product over.",
        },
        {
          kind: "h3",
          text: "What happens next",
        },
        {
          kind: "p",
          text: "Where we can, the first thing we do for a damaged, faulty or incorrect product is send you a replacement. A replacement is provided without additional cost wherever the law requires us to provide it, and where a suitable replacement is available.",
        },
        {
          kind: "p",
          text: "If a replacement is not available, we review the case and give you the remedy the law requires — which may be a refund. We will tell you which one we are doing and why.",
        },
        {
          kind: "note",
          text: "Nothing in these rules is intended to prevent you from exercising your rights under the consumer protection laws that apply in India. We do not apply a blanket clause to turn a complaint away, and we do not treat the absence of a photograph or a video as a reason on its own to refuse a genuine claim.",
        },
      ],
    },
    {
      id: "sealed-returns",
      heading: "B. Refund for Sealed and Unopened Products",
      blocks: [
        {
          kind: "p",
          text: "A voluntary change-of-mind refund is available only where every one of the following is true.",
        },
        {
          kind: "ul",
          items: [
            "The product is completely sealed.",
            "The original manufacturer packaging is intact.",
            "The security seals are not broken.",
            "The product has not been activated, registered, used or tampered with.",
            "All original accessories, documents and packaging are present.",
            "You have sent clear photographs of all sides of the sealed package.",
            "You have sent a continuous video showing the sealed product and its condition.",
            "The order is eligible under the published return conditions.",
            `The request was made within ${RETURN_WINDOW_DAYS} calendar days of delivery.`,
          ],
        },
        {
          kind: "note",
          tone: "brand",
          text: "The refund is not issued the moment you upload photographs or a video. The product has to come back to us and be inspected first. Our team looks at it, checks that it is sealed and untouched, and approves the refund after that. We will only skip the physical return where the law requires us to.",
        },
        {
          kind: "p",
          text: "Where a seal is broken, or the product has been activated or used, a voluntary change-of-mind refund may be declined. That decision does not affect any right you have in respect of a product that is damaged, faulty, incorrect or misrepresented.",
        },
      ],
    },
    {
      id: "opened-products",
      heading: "C. No Change-of-Mind Refund for Opened or Used Products",
      blocks: [
        {
          kind: "p",
          text: "ConsoleSeller does not offer voluntary change-of-mind refunds for opened, activated, registered or used gaming consoles and controllers. Once a unit has been opened and set up, we cannot sell it on as new, and that is the reason for the rule.",
        },
        {
          kind: "p",
          text: "This rule does not apply to a product that is defective, damaged, incorrect or misrepresented. Those are handled on their own terms under section A, and on your statutory rights, and they are not affected by anything in this section.",
        },
        {
          kind: "p",
          text: "If a unit is not sealed but something is wrong with it — it does not work, it arrived damaged, it is not what you ordered, or parts are missing — please raise it under that reason rather than a change of mind, and we will put it right.",
        },
      ],
    },
    {
      id: "cancellations",
      heading: "D. Order Cancellation",
      blocks: [
        {
          kind: "p",
          text: "Where the order is decides how your request is handled.",
        },
        {
          kind: "ul",
          items: [
            "Before dispatch — you can ask us to cancel, and we cancel the order.",
            "After dispatch — a cancellation request is subject to the shipping and return process, because the goods are already on their way to you.",
            "After delivery — the order is not cancelled. The return and replacement rules in sections A to E apply instead.",
          ],
        },
        {
          kind: "p",
          text: "We approve or decline every cancellation request, and we give you a reason either way. If the order has already shipped when you ask, we will tell you plainly that it can no longer be called off and what the next step is.",
        },
        {
          kind: "p",
          text: "Where payment has already been collected and we approve the cancellation, the refund is processed in accordance with applicable law and the timelines of our payment provider. Approving the refund is our promise to pay it back; the money has actually gone back once the payment provider confirms it, and we confirm that to you with a reference.",
        },
      ],
    },
    {
      id: "missing-accessories",
      heading: "E. Missing Accessories",
      blocks: [
        {
          kind: "p",
          text: "If something listed for the product never arrived in the box, tell us and we will send it. We ask you for:",
        },
        {
          kind: "ul",
          items: [
            "Your order ID.",
            "Photographs of the product.",
            "Photographs of the package.",
            "A list of the accessories that are missing.",
            "An unboxing video, if you have one.",
          ],
        },
        {
          kind: "p",
          text: "The unboxing video is helpful here too, but it is not a condition of the claim. Once we have checked the claim, we approve the dispatch of the missing accessories, or we give you another remedy that the law allows — a refund of what the missing parts were worth, for instance, if we cannot send them.",
        },
        {
          kind: "p",
          text: "You keep the console or the controller. Nothing is collected from you for a missing-accessories claim.",
        },
      ],
    },
    {
      id: "return-window",
      heading: "F. The Return Window",
      blocks: [
        {
          kind: "note",
          tone: "brand",
          text: `${RETURN_WINDOW_DAYS} calendar days from delivery, for every kind of claim in these rules. The day of delivery counts as day one, and the window closes at the end of the seventh day.`,
        },
        {
          kind: "p",
          text: "The window is measured from the delivery date shown on your order, not from the date you opened the box. If the product was left with a neighbour or with the courier's depot, the delivery date on your order is still the date we measure from.",
        },
        {
          kind: "p",
          text: "The window applies to every claim — damaged, faulty, incorrect, incomplete, and voluntary returns on a sealed unit. It is a short window because a console or controller that has been opened and used cannot be sold on as new, and because the evidence of what arrived is at its clearest soon after delivery.",
        },
      ],
    },
    {
      id: "refund-processing-time",
      heading: "G. How a Refund Is Processed",
      blocks: [
        {
          kind: "note",
          text: "Approved refunds are generally processed within 7–15 days. That period begins on the date we approve the refund — not the date you asked, and not the date the returned product reaches us.",
        },
        {
          kind: "p",
          text: "Where a physical return is needed, the timeline is:",
        },
        {
          kind: "ol",
          items: [
            "You send us the request, with the order number and the reason.",
            "We assess the request and confirm whether it is approved. Approval starts the 7–15 day refund clock.",
            "If a physical return is needed, we send you the return instructions and the address.",
            "You return the product, and we receive and inspect it.",
            "We raise the refund, and the 7–15 day clock is running during this period.",
            "The money reaches your account, subject to how long your bank or payment provider takes once we have released it.",
          ],
        },
        {
          kind: "p",
          text: "On top of the 7–15 days, allow 2–5 working days for your bank, card issuer or UPI provider to reflect the credit. We send you a confirmation with the bank reference (UTR) when we release the refund, and you can quote it if the money has not reached you by the end of that period.",
        },
        {
          kind: "p",
          text: "Where a refund is approved but no physical return is required — a damaged item we are replacing, for example — the 7–15 day period starts as soon as we approve the request.",
        },
        {
          kind: "p",
          text: "Refunds are returned to the original payment method, so the money goes back to the account or card you paid from. Where that is not possible — the original method has expired, or you paid cash on delivery — we agree an alternative with you. Refunds cover what you actually paid for the item, including applicable taxes and any delivery you paid on the order where the whole order is returned.",
        },
      ],
    },
    {
      id: "return-shipping",
      heading: "H. Return Shipping Costs",
      blocks: [
        {
          kind: "p",
          text: "Who pays the return shipping depends on why the item is being returned:",
        },
        {
          kind: "ul",
          items: [
            "Faulty, damaged in transit, incorrect or incomplete products — we pay. We provide a prepaid label or arrange a pickup.",
            "Change-of-mind returns — the customer bears the return shipping cost, or our actual return courier fee is deducted from the refund.",
            "Large or heavy items such as a console — collected from your delivery address.",
          ],
        },
        {
          kind: "p",
          text: "Where a return shipping cost is deducted from the refund, we show you the amount before you confirm. A product returned to us at our fault is always refunded in full, without a deduction for shipping.",
        },
      ],
    },
    {
      id: "inspection",
      heading: "I. Inspection of the Returned Product",
      blocks: [
        {
          kind: "p",
          text: "Where a product has to come back to us, it is inspected before we settle the claim. The inspection is carried out by a person, and what they find is recorded on your request along with the date and their name.",
        },
        {
          kind: "ul",
          items: [
            "We check the unit against your claim and against the photographs you sent.",
            "We read the serial number off the unit, where it carries one, and match it against what you told us.",
            "We check the condition of the unit and of the packaging it came in.",
            "The result is recorded as a pass or a fail, with notes on what we found.",
          ],
        },
        {
          kind: "p",
          text: "The inspection is what a refund waits on. A refund is not raised because photographs were uploaded — it is raised after the product has come back and has been checked. The only time we settle a claim without the physical product is where the law requires us to.",
        },
        {
          kind: "p",
          text: "If the inspection does not match your claim, we tell you what we found and why, and we give you the chance to send us anything further before the case is closed.",
        },
      ],
    },
    {
      id: "replacement-procedure",
      heading: "J. The Replacement Procedure",
      blocks: [
        {
          kind: "p",
          text: "Where a damaged, faulty or incorrect product is replaced, this is what happens.",
        },
        {
          kind: "ol",
          items: [
            "You raise the request with your photographs and your description of the problem.",
            "We accept the claim and approve a replacement.",
            "We arrange the pickup of the unit that came back, and it is inspected when it reaches us.",
            "We dispatch a brand-new unit. We give you the courier's name and the tracking number, and the date it went out.",
            "You can follow the shipment from your account — the status moves from dispatched, to in transit, to out for delivery, to delivered.",
            "The request is closed once the replacement has been delivered to you.",
          ],
        },
        {
          kind: "p",
          text: "A replacement is provided without additional cost wherever the law requires us to provide it, and wherever a suitable replacement is available. If a replacement is not available, we review the case and give you the remedy the law requires, which may be a refund.",
        },
        {
          kind: "p",
          text: "Where you have sent us a unit with a serial number, we record that serial number, and we record the serial number of the unit that goes out, so that the two can be matched against each other afterwards.",
        },
      ],
    },
    {
      id: "warranty",
      heading: "K. Warranty",
      blocks: [
        {
          kind: "p",
          text: "Every product we sell carries the manufacturer's warranty, and the warranty period is stated on the product page. The warranty is the manufacturer's, and it is honoured by them, through us.",
        },
        {
          kind: "ul",
          items: [
            "Keep your invoice and the order confirmation — the warranty is claimed against the purchase.",
            "Raise a warranty claim with us and we will take it up with the manufacturer on your behalf.",
            "A warranty repair or replacement is arranged through the manufacturer's service network, which we will give you.",
            "Where a unit is covered by warranty and has failed within the warranty period, the remedy is the manufacturer's, and it is not limited by the return rules in this document.",
          ],
        },
        {
          kind: "p",
          text: "A product that fails within its warranty period is a fault, not a change of mind. Raise it under the reason that fits — a defective product — and it is handled under section A, on your statutory rights as well as the warranty.",
        },
      ],
    },
    {
      id: "how-to-request",
      heading: "L. How to Request a Return, Replacement or Cancellation",
      blocks: [
        {
          kind: "ol",
          items: [
            "Open the order in your account — My Orders — and choose the order.",
            "Choose the item, the reason, and how you would like it put right. The form shows you exactly what to send with your claim.",
            "Give us the date the parcel arrived, and the best way to reach you.",
            "Add your photographs, and your unboxing video if you have one.",
            "Send it. We confirm what we have and what happens next.",
            "Where a return is needed, we arrange the pickup and send you the address.",
            "We inspect the product, and we raise the refund or the replacement.",
          ],
        },
        {
          kind: "p",
          text: "If you cannot send one of the pieces of evidence we ask for, tell us why in the box on the form. Your request still goes forward, and a person still looks at it. We will not turn a genuine claim away only because a photograph or an unboxing video is missing.",
        },
        {
          kind: "p",
          text: "You can also raise anything of this kind by writing to us with your order number. The form is quicker, because it shows you the evidence we need for the reason you pick.",
        },
        {
          kind: "p",
          text: "Every request gets a reference number, and every change to it is recorded against that number and shown to you on your account, with the date it happened.",
        },
      ],
    },
    {
      id: "contact",
      heading: "M. Contact Information",
      blocks: [
        {
          kind: "p",
          text: "For all returns, refunds, replacements and warranty queries:",
        },
        {
          kind: "ul",
          items: [
            "Business name: Console Seller",
            "Customer support email: consoleseller.in@gmail.com",
            "Customer support phone: +91 98760 22697",
            "Business address: H.No. 193, Ranchi Colony, Tharike Threekey, Ludhiana, Punjab - 142021",
            "Return shipping address: H.No. 193, Ranchi Colony, Tharike Threekey, Ludhiana, Punjab - 142021",
            "Support hours: Monday to Saturday, 9am – 7pm IST",
          ],
        },
        {
          kind: "p",
          text: "When you contact us about a return, please have your order number ready so we can pull the order up straight away.",
        },
      ],
    },
    {
      id: "grievances",
      heading: "N. Consumer Grievances",
      blocks: [
        {
          kind: "p",
          text: "If you are not satisfied with how a claim has been handled, you can take it further. This is what that looks like.",
        },
        {
          kind: "ol",
          items: [
            "Write to us first, at consoleseller.in@gmail.com, with your request reference and what you are not happy about. We will look at it again and come back to you.",
            "If you still are not satisfied, write to our grievance officer at the same address, marked for the attention of the Grievance Officer. We will acknowledge it in writing within seven days.",
            "We will then resolve the grievance and inform you of the outcome, and of how to take the matter further if you remain dissatisfied.",
          ],
        },
        {
          kind: "p",
          text: "You also have the right to approach the consumer forum or the National Consumer Helpline if your grievance is not resolved to your satisfaction. Nothing in these rules takes that right away from you.",
        },
        {
          kind: "p",
          text: "The Consumer Protection Act, 2019 and the rules made under it apply to every purchase you make from us. Where this document says something that is not consistent with those laws, the law is what we follow.",
        },
      ],
    },
  ],
};

export default function RefundPolicyPage() {
  return <PolicyPage doc={doc} />;
}
