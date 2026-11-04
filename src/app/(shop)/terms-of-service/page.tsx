import type { Metadata } from "next";
import { PolicyPage, type PolicyDoc } from "@/components/policy/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that apply when you buy consoles, controllers and gaming accessories from the ConsoleSeller store.",
};

const doc: PolicyDoc = {
  title: "Terms of Service",
  eyebrow: "Customer Support",
  intro:
    "These terms govern your use of the ConsoleSeller website and any order you place through it. Please read them before ordering — they explain what we do, what we ask of you, and what happens if something does not go to plan.",
  updated: "April 2026",
  sections: [
    {
      id: "acceptance",
      heading: "1. Introduction and Acceptance of Terms",
      blocks: [
        {
          kind: "p",
          text: "These Terms of Service (\"Terms\") form a binding agreement between you and Console Seller (\"ConsoleSeller\", \"we\", \"us\"), the operator of the gaming products store at https://consoleseller.com. We sell consoles, controllers and gaming accessories, including PlayStation 5 consoles, PlayStation and DualSense controllers, Xbox consoles, Xbox wireless controllers and related accessories, to customers in India.",
        },
        {
          kind: "p",
          text: "By browsing the site, creating an account, or placing an order, you accept these Terms. If you do not accept them, please do not use the site. If you are accepting on behalf of a company or another legal entity, you confirm that you are authorised to bind it.",
        },
        {
          kind: "p",
          text: "These Terms should be read together with our Privacy Policy and our Refund and Return Policy, which form part of this agreement. Where a product listing or an order confirmation states something more specific than these Terms — for example, a delivery estimate or a warranty period — that listing or order governs that particular order.",
        },
        {
          kind: "note",
          text: "Nothing in these Terms limits or excludes your rights under the Consumer Protection Act, 2019, the Consumer Protection (E-Commerce) Rules, 2020, or any other applicable law. Where a clause in these Terms conflicts with a right you have under that law, your statutory right prevails.",
        },
      ],
    },
    {
      id: "eligibility",
      heading: "2. Eligibility to Purchase",
      blocks: [
        {
          kind: "p",
          text: "You must be at least 18 years old to enter into a contract with us, or have the consent of a parent or guardian who is contracting on your behalf. By ordering, you confirm you meet this requirement.",
        },
        {
          kind: "p",
          text: "Products on this site are intended for purchase by consumers in India. We may decline or cancel an order where we reasonably believe the buyer is not resident in India, where the order is for resale without our agreement, or where we cannot lawfully supply the item — for example, where a product is restricted in the state to which it is being shipped.",
        },
      ],
    },
    {
      id: "availability",
      heading: "3. Products and Availability",
      blocks: [
        {
          kind: "p",
          text: "We sell the products listed on the site, but availability is not guaranteed. Stock levels change, and a product shown on a page may be out of stock, temporarily unavailable, or discontinued by the time your order reaches us.",
        },
        {
          kind: "p",
          text: "Where a product is unavailable, we will let you know and will either cancel the affected line and refund it, or offer an equivalent alternative at your choice. Any delivery estimate, dispatch window or availability statement shown on a product page applies to that product and to your order — it is an estimate based on current stock and courier performance, not a guaranteed date.",
        },
      ],
    },
    {
      id: "descriptions",
      heading: "4. Product Descriptions and Images",
      blocks: [
        {
          kind: "p",
          text: "We take care to describe each product accurately, and to photograph it as it actually is. Product images are for illustration and may differ slightly from the item you receive — packaging, bundled accessories and labelling can vary between production batches, particularly for console hardware and for accessories sourced from the manufacturer.",
        },
        {
          kind: "p",
          text: "Specifications listed on a product page — storage capacity, connectivity, compatibility, battery life, box contents — are taken from the manufacturer's information for that model. If you need a specific specification to be confirmed before you buy, ask us first and we will check the listing.",
        },
        {
          kind: "p",
          text: "Where a product page shows a rating or a review count, that figure comes from the reviews collected for that product and is not a guarantee of any particular result.",
        },
      ],
    },
    {
      id: "pricing",
      heading: "5. Pricing and Payment",
      blocks: [
        {
          kind: "p",
          text: "Prices are shown in Indian Rupees (₹) and include applicable taxes unless the page states otherwise. Delivery is included in the price on every order, wherever you are in India.",
        },
        {
          kind: "p",
          text: "We try to keep prices accurate, but a product may be listed at an incorrect price because of a typographical or system error. If we discover that the listed price is wrong and you have already ordered, we will contact you before dispatch. You then have the choice of cancelling for a full refund of what you paid, or of accepting the correct price. If the error makes the price obviously incorrect, we may cancel the order and refund you in full without asking.",
        },
        {
          kind: "p",
          text: "Payment is taken securely through our payment service provider, Razorpay, using UPI, credit/debit cards, and net banking as shown at checkout. Full payment credentials are encrypted and processed on Razorpay's secure infrastructure and are not stored by us. We dispatch an order once payment has been confirmed, unless the order is cancelled under these Terms.",
        },
      ],
    },
    {
      id: "confirmation",
      heading: "6. Order Confirmation and Cancellation",
      blocks: [
        {
          kind: "p",
          text: "An order is an offer to buy. A contract comes into existence when we send you an order confirmation, or when we dispatch the goods, whichever happens first. An order acknowledgement showing that we have received your order is not a confirmation that the contract has been formed.",
        },
        {
          kind: "p",
          text: "We may decline or cancel an order — with a full refund of anything already paid — if the item turns out to be unavailable or priced incorrectly, if we cannot deliver to the address given, if the order appears to be a duplicate, or if we are required to decline it to comply with law. We will contact you as quickly as we can if this happens.",
        },
        {
          kind: "p",
          text: "You can request cancellation at any time before dispatch by contacting our support team. Whether a cancellation is accepted, and what happens to the refund, is set out in the Cancellation section of our Refund and Return Policy. Once an order has been dispatched, it can no longer be cancelled and becomes a return instead.",
        },
      ],
    },
    {
      id: "shipping",
      heading: "7. Shipping and Delivery",
      blocks: [
        {
          kind: "p",
          text: "We deliver across India. The delivery estimate shown on a product page and at checkout applies to that order and reflects current courier performance. It is an estimate rather than a guaranteed date, and it starts when the order is dispatched, not when it is placed.",
        },
        {
          kind: "p",
          text: "We aim to dispatch in-stock orders the same working day for orders placed before 4pm IST, and within 24–48 hours otherwise. Delivery is typically 2–4 working days for metros and 4–7 working days elsewhere via Delhivery. Remote or PIN-code-restricted locations may take longer, and split consignments may arrive separately. Where a product page or order confirmation states a different delivery estimate, that estimate applies to that order.",
        },
        {
          kind: "p",
          text: "Please check your delivery address and phone number before you order — we cannot redirect or recall a parcel once it has left our warehouse, though we will help you raise a query with the courier.",
        },
      ],
    },
    {
      id: "warranty",
      heading: "8. Genuine Products and Product Warranty",
      blocks: [
        {
          kind: "p",
          text: "We describe each product's warranty on its own product page, and we sell stock sourced through the channels stated there. The warranty you receive is the warranty stated in that listing and on your order confirmation — nothing in these Terms adds to it, reduces it, or replaces it.",
        },
        {
          kind: "p",
          text: "Manufacturer warranties are provided by the manufacturer under their own terms and are administered by them or by their authorised service network. Where a listing states that a product carries a manufacturer's warranty in India, that warranty is the manufacturer's, and we will help you with the claim, but the terms of that warranty are the manufacturer's terms, not ours.",
        },
        {
          kind: "p",
          text: "Warranty periods and coverage differ by product and by model. Read the warranty information on the product page before you buy, and ask us if it is unclear. Warranty claims should be raised through our support team so that we can take up the case with the manufacturer on your behalf.",
        },
      ],
    },
    {
      id: "customer-responsibilities",
      heading: "9. Customer Responsibilities",
      blocks: [
        {
          kind: "p",
          text: "When you order from us, you agree to:",
        },
        {
          kind: "ul",
          items: [
            "Give us accurate and complete information — particularly your name, phone number and delivery address. We cannot be held responsible for a failed delivery caused by information you have given us incorrectly.",
            "Provide a delivery address where someone can receive the parcel, and keep your phone number reachable during the delivery window.",
            "Not order a product for an illegal purpose, and not attempt to place an order that is a duplicate in error without telling us.",
            "Use the product in line with the manufacturer's instructions, and keep the packaging and accessories until you are certain you will not need them.",
            "Raise any problem with an order promptly — defects, damage, missing items — so that we can resolve it. Section 11 and our Refund and Return Policy explain the timescales.",
          ],
        },
      ],
    },
    {
      id: "returns",
      heading: "10. Returns and Refunds",
      blocks: [
        {
          kind: "p",
          text: "If you are not satisfied with what you bought, you may be eligible to return it. Our Refund and Return Policy sets out the return window, what you need to do, who pays the return shipping, and how long a refund takes. That policy forms part of these Terms.",
        },
        {
          kind: "p",
          text: "In summary: a return request must be made within the return window, the item must be in a condition that allows it to be resold, and refunds are generally processed within 7–15 days of a request being approved. The policy also explains the cases where a faulty or incorrect product is dealt with differently.",
        },
        {
          kind: "note",
          text: "Where a product is defective, damaged on arrival, incorrect, or incompletely supplied, your rights under the Consumer Protection Act, 2019 — including the right to a replacement or a refund for a defect — are not limited by these Terms or by the return process described in our policy.",
        },
      ],
    },
    {
      id: "damaged",
      heading: "11. Damaged, Defective, Incorrect, or Missing Products",
      blocks: [
        {
          kind: "p",
          text: "We want to put right anything that reaches you broken, faulty, not what you ordered, or incomplete. Tell us as soon as you can, quoting your order number and describing the problem. Photographs or a short video help us resolve a damage claim quickly, and we will ask for them where they are reasonably needed to assess the claim.",
        },
        {
          kind: "p",
          text: "Where a product is confirmed as damaged in transit, defective on arrival, incorrect, or missing from the parcel, we will arrange a replacement, a repair where that is more appropriate, or a refund, and we will bear the return shipping where the fault is ours. Our Refund and Return Policy explains the process in full.",
        },
        {
          kind: "p",
          text: "Where a damage appears after delivery rather than on arrival, raise it with us within the return window so that we can assess it.",
        },
      ],
    },
    {
      id: "ip",
      heading: "12. Intellectual Property",
      blocks: [
        {
          kind: "p",
          text: "The ConsoleSeller name, logo, website design, product copy, photographs and the arrangement of the site belong to us or to our licensors. Product names, trade marks, logos and images belonging to Sony, Microsoft and other manufacturers remain the property of those manufacturers and are used here to identify the products we sell.",
        },
        {
          kind: "p",
          text: "You may not copy, reproduce or republish substantial parts of the site, use our branding in a way that suggests we are connected with your business, or attempt to harvest or scrape the catalogue for a commercial database. You may quote short extracts from these Terms and our policy pages for your own reference, and link to our pages.",
        },
      ],
    },
    {
      id: "liability",
      heading: "13. Limitation of Liability",
      blocks: [
        {
          kind: "p",
          text: "We do not exclude or limit our liability for anything that cannot lawfully be excluded or limited, including liability for death or personal injury caused by our negligence, for fraud or fraudulent misrepresentation, or for any matter which it would be unlawful for us to exclude under the Consumer Protection Act, 2019 or any other applicable law.",
        },
        {
          kind: "p",
          text: "Subject to that, and to the extent permitted by law:",
        },
        {
          kind: "ul",
          items: [
            "We are not responsible for loss arising from your use of a product in a way the manufacturer did not intend, from your failure to follow the manufacturer's instructions, or from your modification of a product after delivery.",
            "We are not responsible for indirect or consequential loss, or for loss of profit, revenue or opportunity, arising from an order.",
            "Our total liability in connection with an order is limited to the amount you actually paid for the products in that order.",
            "We are not responsible for delays or failures caused by events outside our reasonable control, including courier performance, network or power failures, acts of God, or government action.",
          ],
        },
        {
          kind: "p",
          text: "Nothing here affects your statutory remedies for goods that are not of satisfactory quality, not as described, or not fit for their purpose.",
        },
      ],
    },
    {
      id: "changes",
      heading: "14. Changes to These Terms",
      blocks: [
        {
          kind: "p",
          text: "We may update these Terms from time to time. The date at the top of the page shows when they were last revised. The version that applied to your order is the version published on the date that order was placed.",
        },
        {
          kind: "p",
          text: "Continuing to use the site after a change takes effect means you accept the updated Terms. Where a change affects an order you have already placed, we will honour the terms that applied when you placed it.",
        },
      ],
    },
    {
      id: "law",
      heading: "15. Applicable Law and Dispute Resolution",
      blocks: [
        {
          kind: "p",
          text: "These Terms, and any dispute arising out of your use of the site or an order placed through it, are governed by the laws of India. The courts at Ludhiana, Punjab have exclusive jurisdiction over any such dispute, subject always to your right to bring a complaint before the appropriate consumer forum.",
        },
        {
          kind: "p",
          text: "Before taking formal proceedings, please raise the matter with our support team. Most issues are resolved quickly. If you are not satisfied, we will provide the details of our Grievance Officer, whose escalation is the next step under the Consumer Protection Act, 2019.",
        },
        {
          kind: "note",
          text: "As a consumer, you may approach the Consumer Disputes Redressal Commission in the place where you live or where you ordinarily work, or where the cause of action arises, regardless of anything in this section.",
        },
      ],
    },
    {
      id: "contact",
      heading: "16. Contact Information",
      blocks: [
        {
          kind: "p",
          text: "Questions about these Terms, or about an order, are best sent to our support team:",
        },
        {
          kind: "ul",
          items: [
            "Business name: Console Seller",
            "Customer support: piyushtaank210@gmail.com",
            "Telephone: +91 98760 22697",
            "Registered / business address: H.No. 193, Ranchi Colony, Tharike Threekey, Ludhiana, Punjab - 142021",
            "Grievance Officer: Piyush Taank, piyushtaank210@gmail.com, +91 98760 22697",
          ],
        },
        {
          kind: "p",
          text: "You can also reach us through the contact form on this website.",
        },
      ],
    },
  ],
};

export default function TermsOfServicePage() {
  return <PolicyPage doc={doc} />;
}
