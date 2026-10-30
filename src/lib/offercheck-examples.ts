/** Three made-up offers for the click-to-try buttons. Invented text; no real firm. Used by the unit tests and the e2e run. */
export interface OfferExample { id: "clean" | "borderline" | "predatory"; label: string; blurb: string; text: string }

export const OFFER_EXAMPLES: OfferExample[] = [
  {
    id: "clean", label: "Example 1: clean", blurb: "A licensed broker, contingency only, paid to you",
    text: `Thanks for reaching out. We are a licensed customs broker (filer code on request) and we file CAPE Declarations as the filer of record.
We charge a 10% contingency fee on refunds actually paid. There is no upfront fee, no retainer, and no fee unless a refund is paid.
CBP pays the refund by ACH to your own bank account that you enrolled in ACE; we never receive your refund and we never ask for your ACE password or bank details.
We act under a limited power of attorney for CAPE filing only. You can cancel at any time before we file.
We cannot guarantee a refund amount or timing; CBP generally pays 60 to 90 days after acceptance.`,
  },
  {
    id: "borderline", label: "Example 2: borderline", blurb: "Legal terms that cost you something",
    text: `Hi, thanks for your interest. Here is our proposal for your IEEPA refunds.
We would file your CAPE Declaration as your licensed customs broker, under a limited power of attorney limited to CAPE filing.
Our fee is a 20% contingency fee on refunds actually received, with no upfront cost. We will never ask for your ACE password.
CBP pays refunds by ACH to the importer of record or its notify party. We ask that you designate our firm as the Form 4811 notify party.
The agreement has a 12-month term that renews automatically unless you cancel with 30 days' written notice. We cannot guarantee a refund amount or timing.
Pricing ends Friday.`,
  },
  {
    id: "predatory", label: "Example 3: predatory", blurb: "Hits most of CBP's warning signs",
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
];
