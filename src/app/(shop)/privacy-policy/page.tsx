import type { Metadata } from "next";
import { PolicyPage, type PolicyDoc } from "@/components/policy/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How ConsoleSeller collects, uses, stores and protects your personal information when you buy consoles, controllers and gaming accessories.",
};

const UPDATED = "April 2026";

const doc: PolicyDoc = {
  title: "Privacy Policy",
  eyebrow: "Customer Support",
  intro:
    "This policy explains what personal information we collect when you use this website, why we collect it, how long we keep it, and the choices you have. It applies to the ConsoleSeller website and to orders placed through it.",
  updated: UPDATED,
  sections: [
    {
      id: "introduction",
      heading: "1. Introduction",
      blocks: [
        {
          kind: "p",
          text: "ConsoleSeller (\"ConsoleSeller\", \"we\", \"us\") operates the gaming products store at https://consoleseller.com. We sell consoles, controllers and gaming accessories — including PlayStation 5 consoles, PlayStation and DualSense controllers, Xbox consoles, Xbox wireless controllers and related accessories — and we serve customers across India.",
        },
        {
          kind: "p",
          text: "This policy is written for our customers and covers the website itself. It does not cover the separate privacy practices of the manufacturers whose products we sell, or of any third-party service we rely on for a specific purpose — those are described where they are relevant.",
        },
        {
          kind: "p",
          text: "We are registered as a data fiduciary under the Digital Personal Data Protection Act, 2023 (\"the DPDP Act\"). Our legal entity is Console Seller, registered address H.No. 193, Ranchi Colony, Tharike Threekey, Ludhiana, Punjab - 142021. If you have questions about this policy or about your personal information, contact us using the details in the last section.",
        },
      ],
    },
    {
      id: "information-we-collect",
      heading: "2. Information We Collect",
      blocks: [
        {
          kind: "p",
          text: "We collect two broad kinds of information: information you give us, and information we collect automatically when you use the site.",
        },
        {
          kind: "h3",
          text: "Information you give us",
        },
        {
          kind: "ul",
          items: [
            "Details you enter when you create an account or place an order — your name, email address, phone number, delivery address and any delivery instructions you choose to add.",
            "The contents of any enquiry, review or message you send to our support team, including your email address and any order ID you quote.",
            "Payment-related confirmation details, such as the last four digits of a card and the payment provider's reference — where a payment is actually taken.",
          ],
        },
        {
          kind: "h3",
          text: "Information collected automatically",
        },
        {
          kind: "ul",
          items: [
            "Your IP address, the browser and device you are using, and the pages you visit and the times you visit them.",
            "The contents of your cart and which products you have looked at, so the site can remember your basket between visits.",
            "Referrer information — the page that led you to us — and basic, aggregated usage patterns.",
          ],
        },
        {
          kind: "note",
          text: "We do not ask for information that is not needed for the order you are placing. If a field is marked optional, leaving it blank will not stop you from checking out.",
        },
      ],
    },
    {
      id: "personal-information",
      heading: "3. Personal Information Provided by Customers",
      blocks: [
        {
          kind: "p",
          text: "When you register an account we ask for your name, email address and a password. We store the password as a one-way salted hash — we cannot read it, and no one on our team, including support staff, can retrieve your password.",
        },
        {
          kind: "p",
          text: "If you add a phone number to your profile or to an order, we use it to coordinate delivery — for example, to call ahead about an address that cannot be reached. We also ask for your phone number on the contact form, so that we can reach you about an enquiry if email is not enough.",
        },
        {
          kind: "p",
          text: "When you save an address to your account, we store the recipient's name, phone number, street address, city, state and PIN code, together with a label you choose and a flag marking which one is your default. You can remove a saved address at any time from your account.",
        },
        {
          kind: "p",
          text: "Children should not create an account or place an order with us. See the section on children's privacy below.",
        },
      ],
    },
    {
      id: "order-and-payment-information",
      heading: "4. Order and Payment Information",
      blocks: [
        {
          kind: "p",
          text: "When you place an order we record the items you bought, the quantity, the price paid, your delivery address, your chosen payment method and the order status. This is our business record: we need it to dispatch the order, to handle a return, and to meet our tax and accounting obligations.",
        },
        {
          kind: "p",
          text: "Payment is handled securely by our payment service provider, Razorpay. Full card numbers, UPI credentials, CVV codes and other sensitive authentication data are entered directly on Razorpay's encrypted checkout page and never reach our servers — we receive only the confirmation we need to reconcile the payment, such as the transaction reference and payment status. We do not store card details on this website.",
        },
        {
          kind: "p",
          text: "We keep your order history so that we can honour warranty claims, answer questions about past purchases, and show you your own order history in your account. You can see everything we hold about your orders in the Orders section of your account.",
        },
      ],
    },
    {
      id: "cookies",
      heading: "5. Cookies and Website Analytics",
      blocks: [
        {
          kind: "p",
          text: "We do use cookies. Two of them are strictly necessary and are set the moment you arrive:",
        },
        {
          kind: "ul",
          items: [
            "A session cookie that keeps you signed in to your account for up to 30 days. It carries an opaque random token and contains no personal information itself.",
            "A cart cookie that remembers which products you have added and which address you were last using, so your basket is still there when you come back.",
          ],
        },
        {
          kind: "p",
          text: "Both are HTTP-only, so scripts running in your browser cannot read them, and they are scoped to this site.",
        },
        {
          kind: "h3",
          text: "Analytics",
        },
        {
          kind: "p",
          text: "We currently do not use third-party analytics or behavioral tracking tools. We only use the essential cookies strictly necessary to keep you signed in and remember your shopping cart.",
        },
        {
          kind: "p",
          text: "You can block or delete cookies through your browser settings. Blocking the two cookies above means you will be signed out and your basket will be cleared, but you can still browse and place an order as a guest.",
        },
      ],
    },
    {
      id: "how-we-use",
      heading: "6. How We Use Customer Information",
      blocks: [
        {
          kind: "p",
          text: "We use your information for the following purposes:",
        },
        {
          kind: "ul",
          items: [
            "To process your order and take payment for it.",
            "To arrange shipping and delivery, and to hand the details to the courier who carries it.",
            "To provide customer support — answering your enquiries, arranging a replacement or a return, and keeping a record of what was agreed.",
            "To manage your account: sign-in, order history, saved addresses and profile details.",
            "To prevent fraud and abuse — for example, spotting unusual order patterns or a stolen card being used on the site.",
            "To meet legal, tax and accounting obligations, including record-keeping and responding to legitimate requests from authorities.",
            "To improve the website — understanding which products are browsed, whether pages perform well, and where the checkout loses people.",
            "To send marketing communications, where you have asked us to, and to tell you about an order that is affected by a change to these policies. You can opt out of marketing at any time.",
          ],
        },
        {
          kind: "p",
          text: "We do not sell your personal information to anyone, and we do not rent it out. We do not make decisions about you using only automated means in a way that produces legal or similarly significant effects.",
        },
      ],
    },
    {
      id: "third-parties",
      heading: "7. Payment Processing and Third-Party Services",
      blocks: [
        {
          kind: "p",
          text: "We do not run every part of this ourselves. Where we use someone else, we tell you, and we only pass across what that service needs to do its job:",
        },
        {
          kind: "ul",
          items: [
            "Razorpay — takes and processes payment, and confirms the transaction back to us.",
            "Our courier partners (Delhivery) — receive the delivery name, address and phone number to deliver the parcel.",
            "Transactional email service — sends order confirmations and support updates.",
            "Hostinger — hosts the site infrastructure and stores the database that holds your information.",
          ],
        },
        {
          kind: "p",
          text: "These providers process information on our instructions and for their own purposes under their own policies. We do not control how they handle it once it is with them, which is why we name them here rather than claiming we never share anything.",
        },
      ],
    },
    {
      id: "sharing",
      heading: "8. Sharing of Personal Information",
      blocks: [
        {
          kind: "p",
          text: "We share personal information in a small number of circumstances, and only to the extent needed:",
        },
        {
          kind: "ul",
          items: [
            "To the courier delivering your order — the delivery details only.",
            "To our payment provider, to take payment and to handle a refund back to you.",
            "To our email provider, to send you the messages described in this policy.",
            "To a professional adviser, auditor or regulator where we are required to disclose by law or need to in order to establish or defend legal claims.",
            "To a buyer or successor if the business is restructured or sold, provided the information is transferred on the same terms this policy sets out.",
            "Where you have asked us to, or where we are legally obliged to — for example, to a law enforcement authority investigating fraud.",
          ],
        },
        {
          kind: "p",
          text: "We do not share your information for anyone else's marketing purposes. We do not disclose your order details to a manufacturer or to another customer.",
        },
      ],
    },
    {
      id: "security",
      heading: "9. Data Security",
      blocks: [
        {
          kind: "p",
          text: "We take reasonable technical and organisational steps to protect your information against unauthorised access, alteration, loss or disclosure. In practice that means:",
        },
        {
          kind: "ul",
          items: [
            "Passwords are stored as salted scrypt hashes, never in plain text, and are compared in a way that resists timing attacks.",
            "Session cookies are HTTP-only and scoped to this site, so they cannot be read by scripts and are not sent to other domains.",
            "Sensitive payment details are handled on the payment provider's page rather than ours.",
            "Access to the systems holding customer information is limited to staff who need it for their role, and protected by access controls.",
            "The site is served over HTTPS so that information is encrypted in transit between your browser and our servers.",
          ],
        },
        {
          kind: "p",
          text: "No system is perfectly secure. If a breach affects your information and creates a legally notifiable risk, we will tell you and the appropriate authority in line with the DPDP Act.",
        },
      ],
    },
    {
      id: "retention",
      heading: "10. Data Retention",
      blocks: [
        {
          kind: "p",
          text: "We keep information for as long as we need it, and no longer:",
        },
        {
          kind: "ul",
          items: [
            "Account information — for as long as your account is open, and for up to 180 days after account closure, after which we delete or anonymise it.",
            "Order and invoice records — for 8 years from the end of the financial year as required by Indian tax and accounting law.",
            "Saved addresses — until you delete them or close your account.",
            "Support enquiries — for 12 months after the enquiry is closed.",
            "Payment records held by Razorpay — maintained under Razorpay's RBI-compliant retention policy.",
          ],
        },
        {
          kind: "p",
          text: "When we delete information we delete it, rather than simply hiding it. Where an anonymised record is kept for counting or analysis, it can no longer be linked back to you.",
        },
      ],
    },
    {
      id: "your-rights",
      heading: "11. Customer Privacy Rights",
      blocks: [
        {
          kind: "p",
          text: "Under the DPDP Act and the Consumer Protection Act, 2019, you have rights over your personal information. You can:",
        },
        {
          kind: "ul",
          items: [
            "Ask what personal information we hold about you, and get a copy of it.",
            "Ask us to correct information that is wrong or incomplete.",
            "Ask us to update or erase information, and withdraw consent you have given — subject to the records we are legally required to keep.",
            "Nominate someone to exercise these rights on your behalf if you are unable to do so yourself.",
            "Receive a grievance response from us, and escalate to the Grievance Officer named below if you are not satisfied.",
            "Raise a complaint with the Data Protection Board of India if our response does not resolve the matter.",
          ],
        },
        {
          kind: "p",
          text: "To exercise any of these rights, email piyushtaank210@gmail.com. We will acknowledge your request, verify your identity so that we do not disclose your information to someone else, and respond within the time the law requires. We do not charge for this unless a request is manifestly unfounded or excessive.",
        },
        {
          kind: "p",
          text: "If you would rather not open an account at all, you can browse and check out as a guest. We will still hold the order details needed to deliver your order and to handle a return.",
        },
      ],
    },
    {
      id: "marketing",
      heading: "12. Marketing Communications",
      blocks: [
        {
          kind: "p",
          text: "If you give us your email address when you order, we use it for order-related messages: confirmations, dispatch notices, delivery updates and any return or warranty correspondence. These are service messages, and we will send them whether or not you have opted in to marketing.",
        },
        {
          kind: "p",
          text: "We send marketing email — new products, offers, restocks — only where you have asked us to, for example by ticking the box at checkout or in your account. Every marketing email includes a way to unsubscribe, and unsubscribing does not affect the service messages above.",
        },
        {
          kind: "p",
          text: "We do not buy or rent mailing lists, and we do not pass your address to another retailer.",
        },
      ],
    },
    {
      id: "children",
      heading: "13. Children's Privacy",
      blocks: [
        {
          kind: "p",
          text: "This store is not directed at children, and the products we sell are intended for adults. We do not knowingly collect personal information from anyone under 18.",
        },
        {
          kind: "p",
          text: "If you believe a child has given us personal information, contact us at piyushtaank210@gmail.com and we will delete it. A parent or guardian who believes a child has placed an order should contact us, and we will work to cancel the order and remove the information.",
        },
      ],
    },
    {
      id: "changes",
      heading: "14. Changes to This Privacy Policy",
      blocks: [
        {
          kind: "p",
          text: "We update this policy when our practices or the law change. The date at the top of the page shows when it was last revised, and the earlier versions are available on request.",
        },
        {
          kind: "p",
          text: "Where a change materially affects how we use information you have already given us — for example, a new purpose we did not tell you about — we will tell you before we start using it in that way, and ask for your consent where the law requires it. Continuing to use the site after a change takes effect means you accept the updated policy.",
        },
      ],
    },
    {
      id: "contact",
      heading: "15. Contact Information",
      blocks: [
        {
          kind: "p",
          text: "For anything in this policy, or to exercise a right described in section 11:",
        },
        {
          kind: "ul",
          items: [
            "Business name: Console Seller",
            "Grievance Officer / Privacy contact: Piyush Taank, piyushtaank210@gmail.com",
            "Customer support: piyushtaank210@gmail.com",
            "Telephone: +91 98760 22697",
            "Registered / business address: H.No. 193, Ranchi Colony, Tharike Threekey, Ludhiana, Punjab - 142021",
          ],
        },
        {
          kind: "p",
          text: "You can also reach us through the contact form on this website, which writes straight into our support queue.",
        },
      ],
    },
  ],
};

export default function PrivacyPolicyPage() {
  return <PolicyPage doc={doc} />;
}
