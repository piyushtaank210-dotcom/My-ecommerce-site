import type { Metadata } from "next";
import { PolicyPage, type PolicyDoc } from "@/components/policy/PolicyPage";

export const metadata: Metadata = {
  title: "Refund and Return Policy",
  description:
    "How to return a console, controller or accessory from ConsoleSeller, and when to expect your refund — generally within 7 to 15 days of approval.",
};

const doc: PolicyDoc = {
  title: "Refund and Return Policy",
  eyebrow: "Customer Support",
  intro:
    "This policy explains when you can return something you have bought from us, how to start the process, who pays for return shipping, and how long a refund takes. Refunds are generally processed within 7–15 days of a request being approved.",
  updated: "April 2026",
  sections: [
    {
      id: "return-eligibility",
      heading: "A. Return Eligibility",
      blocks: [
        {
          kind: "p",
          text: "You can ask us to return or refund an item where any of the following applies:",
        },
        {
          kind: "ul",
          items: [
            "The product is defective — it does not work as it should, or has a fault that the manufacturer's warranty would not cover.",
            "The product arrived damaged, either visibly broken or in a way that only shows when it is switched on.",
            "The product is not what you ordered — a different model, variant, colour or capacity from the one on your order confirmation.",
            "The product is incomplete, for example a console or controller that arrived without a listed accessory or component.",
            "The product is otherwise returnable under this policy, because you changed your mind and the return window has not passed.",
          ],
        },
        {
          kind: "p",
          text: "Some products are not eligible for a change-of-mind return. Those are set out in section F, and the exclusions there do not affect your rights for a product that is defective, damaged, incorrect or incomplete — those are always dealt with under sections D and E, and under your statutory rights.",
        },
        {
          kind: "note",
          text: "Products bought during a sale or with a promotional bundle are not automatically excluded from returns. If a specific promotion states different terms, they apply to that promotion and are shown at the time you buy.",
        },
      ],
    },
    {
      id: "return-window",
      heading: "B. Return Window",
      blocks: [
        {
          kind: "p",
          text: "A return request must be raised within 7 days of the delivery date shown on your order. Once this window has passed we are generally unable to accept a change-of-mind return, because the product may have been opened, used, or resold by then.",
        },
        {
          kind: "p",
          text: "The return window applies to change-of-mind returns only. If a product is defective, damaged, incorrect or incomplete, please raise it with us as soon as you reasonably can — a claim made later may still be considered where the problem was not obvious on delivery, but tell us promptly so that we can agree how to put it right.",
        },
      ],
    },
    {
      id: "refund-processing-time",
      heading: "C. Refund Processing Time",
      blocks: [
        {
          kind: "note",
          text: "Approved refunds are generally processed within 7–15 days. This 7–15 day period begins on the date we approve your refund request — not on the date you ask, and not on the date the returned product reaches us.",
        },
        {
          kind: "p",
          text: "Where a return is required, the timeline is therefore:",
        },
        {
          kind: "ol",
          items: [
            "You send us the return request, with the order number and the reason.",
            "We assess the request and confirm whether it is approved. Approval starts the 7–15 day refund clock.",
            "If a physical return is needed, we send you the return instructions and the address to send it to.",
            "You return the product, and we receive and inspect it.",
            "We issue the refund, and the 7–15 day clock is running during this period.",
            "The money reaches your account, subject to how long your bank or payment provider takes to process it once we have released it.",
          ],
        },
        {
          kind: "p",
          text: "So the 7–15 days covers our processing of the refund. On top of that, allow 2–5 working days for your bank, card issuer or UPI provider to reflect the credit once it has been released. We will send you a confirmation with the bank reference (UTR) when we release the refund, and you can quote the reference if it has not reached you by the end of that period.",
        },
        {
          kind: "p",
          text: "Where a refund is approved but no physical return is required — for example, a damaged item we are replacing — the 7–15 day period starts as soon as we approve the request.",
        },
      ],
    },
    {
      id: "damaged-or-defective",
      heading: "D. Damaged or Defective Products",
      blocks: [
        {
          kind: "p",
          text: "If a product arrives damaged or is not working, tell us straight away — quote your order number, describe the fault, and let us know what has happened.",
        },
        {
          kind: "p",
          text: "We will usually ask for photographs, and sometimes a short video, of the product and its packaging. This is to establish what went wrong and whether the fault is ours, the courier's, or the manufacturer's — it is not a condition of help, and we will not refuse a claim simply because you could not take a photograph.",
        },
        {
          kind: "p",
          text: "Once we have confirmed the problem, we will arrange a replacement, a repair where that is more sensible, or a full refund of the price you paid, together with the return shipping where the fault is ours. If we ask you to send the faulty item back, we will cover the cost — see section I.",
        },
        {
          kind: "p",
          text: "Where the manufacturer offers a warranty on the product, we will help you raise the claim with them and share whatever information they need from us. That is on top of, and does not replace, your right to a refund or replacement from us for a product that is defective on arrival.",
        },
      ],
    },
    {
      id: "missing-items",
      heading: "E. Missing Items",
      blocks: [
        {
          kind: "p",
          text: "If your parcel is short — an item is missing from the box, a bundled accessory has not been included, or the order itself is incomplete — contact us within 48 hours of delivery, quoting your order number.",
        },
        {
          kind: "p",
          text: "Please photograph the opened box and the contents so that we can confirm what was in the parcel when it left us. We check this against the picking list for your order, which lets us establish quickly whether the item was omitted by us or lost in transit — in which case we will claim against the courier and keep you informed.",
        },
        {
          kind: "p",
          text: "Where an item is confirmed missing, we will dispatch the missing item or refund it in full, and we will bear any return shipping that becomes necessary.",
        },
      ],
    },
    {
      id: "non-returnable",
      heading: "F. Non-Returnable Items",
      blocks: [
        {
          kind: "p",
          text: "The following are not eligible for a change-of-mind return, because they cannot be resold or returned to the manufacturer once opened:",
        },
        {
          kind: "ul",
          items: [
            "Consoles and controllers whose seal, serial number or tamper label has been broken, or which have been registered to an online account.",
            "Download codes, digital licences, gift cards and prepaid balances, once the code has been revealed or the balance has been added to an account.",
            "Headsets, controllers and other peripherals that have been used and show signs of use, or that are missing the accessories supplied with them.",
            "Software, and any digital content, once it has been downloaded or activated.",
          ],
        },
        {
          kind: "p",
          text: "This list is limited to items where a return genuinely cannot be accepted. It does not apply to a product that is defective, damaged in transit, faulty on arrival, incorrect, or missing parts — those are dealt with under sections D and E whatever their condition, and your rights under the Consumer Protection Act, 2019 are unaffected by this section.",
        },
      ],
    },
    {
      id: "condition-and-packaging",
      heading: "G. Product Condition and Packaging",
      blocks: [
        {
          kind: "p",
          text: "For a change-of-mind return, please return the product:",
        },
        {
          kind: "ul",
          items: [
            "In a condition that allows us to resell it — complete, working, and with no marks that would prevent it being sold as new.",
            "With its original packaging, box and any insert or protective material.",
            "With every accessory that came with it — the charging cable, the stand, the manual, the box.",
            "With any promotional or gift item that was included with it.",
          ],
        },
        {
          kind: "p",
          text: "Please include proof of purchase — your order number is enough, and we can find the order from that. You do not need to produce a paper invoice.",
        },
        {
          kind: "p",
          text: "Where an item is returned without its packaging or accessories, or in a condition that means we cannot resell it, we may reduce the refund to reflect that, or decline the return. We will always tell you the reason and, where we can, offer you the alternative of a repair, a replacement, or a partial refund. This does not apply where the problem is ours or the manufacturer's.",
        },
      ],
    },
    {
      id: "refund-method",
      heading: "H. Refund Method",
      blocks: [
        {
          kind: "p",
          text: "Approved refunds are generally returned to the original payment method, so that the money goes back to the account or card you paid from. Where that is not possible — for example, if the original method has expired, or if you paid cash on delivery — we will agree an alternative with you.",
        },
        {
          kind: "p",
          text: "Refunds are issued for the amount you actually paid for the item, together with any delivery you paid for the order where the whole order is being returned, and including applicable taxes. Where an item was reduced by a promotion, we do not refund the discount.",
        },
        {
          kind: "p",
          text: "The refund is subject to the limits of our payment provider, which may not permit a refund to a different card, or a partial refund in certain cases. Where we cannot refund the original method, we will explain why and offer you the next best option.",
        },
      ],
    },
    {
      id: "return-shipping",
      heading: "I. Return Shipping Costs",
      blocks: [
        {
          kind: "p",
          text: "Who pays the return shipping depends on why the item is being returned:",
        },
        {
          kind: "ul",
          items: [
            "Faulty, damaged in transit, incorrect or incomplete products — we pay. We will provide a prepaid label or arrange a pickup via Delhivery.",
            "Change-of-mind returns — the customer bears the return shipping cost, or our actual return courier fee of ₹250 is deducted from the refund.",
            "A product that is returned outside the return window, or that does not meet the condition requirements in section G — returned back to the customer, or assessed for a partial restocking fee where agreed in writing.",
            "Large or heavy items such as a console — collected from your delivery address via Delhivery pickup.",
          ],
        },
        {
          kind: "p",
          text: "Where a return shipping cost is deducted from the refund, we will show you the amount before you confirm. Please note that a product returned to us at our fault is always refunded in full, without a deduction for shipping.",
        },
      ],
    },
    {
      id: "cancellations",
      heading: "J. Order Cancellations",
      blocks: [
        {
          kind: "p",
          text: "You can ask us to cancel an order at any time before it is dispatched, by contacting our support team with your order number. Once an order has been handed to the courier it can no longer be cancelled and is instead handled as a return.",
        },
        {
          kind: "p",
          text: "Where we accept a cancellation, the refund is processed in the same way and on the same timeline as any other approved refund — generally within 7–15 days of the cancellation being approved, subject to our payment provider's processing time.",
        },
        {
          kind: "p",
          text: "We may decline a cancellation request where the order has already been dispatched, where it would deprive us of the opportunity to sell the item, or where we have already incurred costs that we cannot recover and which are greater than the value of the order. We will tell you if that is the case and, where the order has been dispatched, offer to help you with a return instead.",
        },
        {
          kind: "p",
          text: "We may cancel an order ourselves, with a full refund, where an item turns out to be unavailable, where the price was listed incorrectly, or where we cannot lawfully supply it.",
        },
      ],
    },
    {
      id: "refund-exceptions",
      heading: "K. Refund Exceptions",
      blocks: [
        {
          kind: "p",
          text: "In a small number of circumstances a refund may not be available, or may be limited. These are set out below, and they are exceptions to the change-of-mind return, not to your statutory rights:",
        },
        {
          kind: "ul",
          items: [
            "Digital items — codes, licences and downloaded content — once the code has been revealed, the licence activated, or the content downloaded, because it cannot be returned.",
            "Items listed in section F as non-returnable, once they have been opened and cannot be resold.",
            "Products that were returned after the return window in section B had passed.",
            "Products returned without the packaging, accessories or proof of purchase needed under section G.",
            "Where a refund has already been issued for the same order, or where the item was refunded by the manufacturer against a warranty claim.",
          ],
        },
        {
          kind: "p",
          text: "None of these exceptions applies to a product that is defective, damaged, incorrect or missing parts, and none of them limits a remedy you have under the Consumer Protection Act, 2019. Where a product is not of satisfactory quality or not as described, we will put it right — with a replacement, a repair, or a refund — regardless of these exceptions.",
        },
      ],
    },
    {
      id: "how-to-request",
      heading: "L. How to Request a Return or Refund",
      blocks: [
        {
          kind: "p",
          text: "The process is the same whether you want to return something you do not want, or to report something that is wrong:",
        },
        {
          kind: "ol",
          items: [
            "Contact our customer support team — use the contact form on this website, or email piyushtaank210@gmail.com.",
            "Give us your order number and the reason for the request. The order number is on your order confirmation and in the Orders section of your account.",
            "Share supporting photographs or videos where they are relevant — for example the damage, the fault, or the contents of the box.",
            "Wait for our confirmation. We will tell you whether the request is approved and, if a return is needed, where to send the product.",
            "Return the product if required, using the instructions we give you, and keep your proof of dispatch.",
            "Receive updates on the approved refund. We will confirm when the refund has been released, and it should reach you within the 7–15 day processing period described in section C, plus the time your bank takes to show it.",
          ],
        },
        {
          kind: "p",
          text: "We aim to acknowledge every request within one working day. You can track the progress of a request on this website by quoting your order number.",
        },
      ],
    },
    {
      id: "contact",
      heading: "M. Contact Information",
      blocks: [
        {
          kind: "p",
          text: "For all returns, refunds and warranty queries:",
        },
        {
          kind: "ul",
          items: [
            "Business name: Console Seller",
            "Customer support email: piyushtaank210@gmail.com",
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
  ],
};

export default function RefundPolicyPage() {
  return <PolicyPage doc={doc} />;
}
