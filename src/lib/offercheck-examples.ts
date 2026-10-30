/** Synthetic offers for the click-to-try buttons. Invented text written for this tool; no real firm, person or domain. Used by the unit tests and the e2e run. */
export type OfferExampleId = "clean" | "flat-broker" | "borderline" | "retainer" | "ace-login" | "bank-redirect" | "lock-in" | "predatory";
export interface OfferExample { id: OfferExampleId; label: string; blurb: string; text: string }

export const OFFER_EXAMPLES: OfferExample[] = [
  {
    id: "clean", label: "Clean contingency", blurb: "A licensed broker, contingency only, paid to you",
    text: `Thanks for reaching out. We are a licensed customs broker (filer code on request) and we file CAPE Declarations as the filer of record.
We charge a 10% contingency fee on refunds actually paid. There is no upfront fee, no retainer, and no fee unless a refund is paid.
CBP pays the refund by ACH to your own bank account that you enrolled in ACE; we never receive your refund and we never ask for your ACE password or bank details.
We act under a limited power of attorney for CAPE filing only. You can cancel at any time before we file.
We cannot guarantee a refund amount or timing; CBP generally pays 60 to 90 days after acceptance.`,
  },
  {
    id: "borderline", label: "Borderline", blurb: "Legal terms that cost you something",
    text: `Hi, thanks for your interest. Here is our proposal for your IEEPA refunds.
We would file your CAPE Declaration as your licensed customs broker, under a limited power of attorney limited to CAPE filing.
Our fee is a 20% contingency fee on refunds actually received, with no upfront cost. We will never ask for your ACE password.
CBP pays refunds by ACH to the importer of record or its notify party. We ask that you designate our firm as the Form 4811 notify party.
The agreement has a 12-month term that renews automatically unless you cancel with 30 days' written notice. We cannot guarantee a refund amount or timing.
Pricing ends Friday.`,
  },
  {
    id: "predatory", label: "Predatory", blurb: "Hits most of CBP's warning signs",
    text: `Subject: URGENT - Your IEEPA tariff refund has been identified
Dear Importer, we are an official refund processing service working with U.S. Customs and Border Protection. Our records show your company is owed an IEEPA tariff refund.
Act now: this offer expires in 48 hours and only 5 spots remain.
To start, pay a one-time onboarding fee of $2,500 due at signing. We then keep a 35% success fee on everything recovered.
We guarantee 100% recovery of every dollar, and you will receive your money within 21 days.
Please send us your ACE Portal username and password so our team can file the claim for you. We will also need your bank routing number and account number.
File your claim on our secure portal; do not contact CBP directly. CBP will deposit the refund into our escrow account, and we will forward your share after fees.
This agreement is exclusive for 36 months, renews automatically, and our fee still applies even if you file on your own. The agreement is non-cancellable.
Sign today to lock in this rate. Reply to refunds@cbp-refund-desk.com.`,
  },
  {
    id: "flat-broker", label: "Flat-fee broker", blurb: "A licensed broker with one flat price and nothing else to flag",
    text: `Hello, and thank you for the call. We are a licensed customs broker and we file CAPE Declarations as the filer of record for entries we handled.
Our fee is a flat $750, invoiced once the declaration is accepted. There is no upfront fee and no percentage of your refund.
CBP pays the refund by ACH to your own bank account that you enrolled in ACE. We never ask for your ACE password, and we do not need your bank details.
We act under a limited power of attorney for CAPE filing only, and you can cancel at any time before we file.
We cannot guarantee a refund amount; CBP generally pays 60 to 90 days after acceptance.`,
  },
  {
    id: "retainer", label: "Retainer first", blurb: "Polite and licensed, but wants money before any refund exists",
    text: `Hi, following up on your enquiry about IEEPA refunds.
We are a licensed customs broker and we would file your CAPE Declaration under a limited power of attorney.
We ask for a retainer of $1,500 due before we begin, and then a 15% contingency fee on refunds actually received.
CBP pays the refund by ACH to your own enrolled bank account. We will never ask for your ACE password.
You may cancel at any time before we file. We cannot guarantee a refund amount or timing.`,
  },
  {
    id: "ace-login", label: "Asks for ACE login", blurb: "Fair percentage, but wants into your ACE account",
    text: `Hello, our team handles IEEPA refund recovery for importers.
Our fee is a 12% contingency fee on refunds actually received, with no upfront cost.
To prepare your claim, please send us your ACE Portal username and password so our analyst can log in and upload the file.
CBP pays the refund by ACH to your own enrolled bank account. You can cancel at any time. We cannot guarantee a refund amount or timing.`,
  },
  {
    id: "bank-redirect", label: "Redirects the refund", blurb: "Asks to change the refund bank account to the firm's",
    text: `Dear Importer, we help companies collect IEEPA tariff refunds. Our fee is 14% of what is recovered, with no upfront fee.
To speed things up, please update your ACH refund account in ACE to our client settlement account, and send your bank routing number and account number so we can confirm it.
We will pass your share on to you within 5 business days of receiving it. We cannot guarantee a refund amount.`,
  },
  {
    id: "lock-in", label: "Lock-in and minimum", blurb: "Exclusive term, a fee floor and a fee that follows you if you leave",
    text: `Proposal for IEEPA refund recovery. We are a licensed customs broker and will file under a limited power of attorney.
Our fee is a 17% contingency fee on refunds actually received, with a minimum fee of $7,500 whatever the refund comes to.
The engagement is exclusive for 24 months and renews automatically. Our fee still applies even if you file on your own or hire another firm.
CBP pays the refund by ACH to your own enrolled bank account. We will never ask for your ACE password. We cannot guarantee a refund amount.`,
  },
];
