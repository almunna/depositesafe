/** Customer wording only. Prices, availability and provider behaviour remain API-owned. */
export type ProductCopy = {
  summary: string;
  features: [string, string];
  beforeStart: string;
  audience?: string;
};

const productCopy: Record<string, ProductCopy> = {
  verify: {
    summary: 'Identity verification for the person you are dealing with, to help you make a more informed decision before going further.',
    features: ['Identity verification', 'Know who you are dealing with'],
    beforeStart: 'The person being verified needs to complete their own identity verification. This start form records your contact email; it does not collect another person’s details or complete their verification.',
  },
  'verify-both': {
    summary: 'You verify them. They verify you. Two people each complete their own identity verification, helping both sides make a more informed decision.',
    features: ['Two identity verifications', 'Each person verifies their own identity'],
    beforeStart: 'Enter a name and email for each of the two people who will complete their own identity verification. Your contact email is kept separately for this check record. Entering these details does not mean either person has been verified.',
  },
  'verify-plus': {
    summary: 'Identity verification and bank account verification together, for the moment money is about to move.',
    features: ['Identity verification', 'Bank account verification'],
    beforeStart: 'Verify Plus combines identity and bank account verification. This start form records your contact email only; it does not collect identity documents or bank account details, and starting a record does not complete either verification.',
  },
  'bank-account-check': {
    summary: 'Check the bank account details you have been given before you send a payment.',
    features: ['Bank account verification', 'Check before sending money'],
    beforeStart: 'This start form records your contact email, not bank account details. A Bank Account Check helps inform your payment decision; it does not guarantee that a payment or the recipient is safe.',
  },
  'property-ownership-check': {
    summary: 'Check who owns a property before you pay money in connection with it.',
    features: ['Property ownership information', 'Check before committing'],
    beforeStart: 'This start form records your contact email, not a property address. Confirm the property and the available coverage before relying on ownership information. An ownership check does not verify the identity or authority of someone contacting you.',
  },
  'company-check': {
    summary: 'Know more about the business you’re dealing with. Find a UK company and review its Companies House details in one clear, saved Company Check.',
    features: ['Company status, address and filing details', 'Your result saved with DepositSafe'],
    beforeStart: 'Pay securely, then search by company name or exact company number. Confirm the business you want to check before running your Company Check.',
  },
  'right-to-rent': {
    summary: 'A Right to Rent check for landlords and letting agents checking a prospective tenant for a property in England.',
    features: ['For landlords and letting agents', 'Properties in England only'],
    audience: 'For landlords and letting agents. England only.',
    beforeStart: 'Confirm which prospective tenant needs the check and which checking route is available. This start form records your contact email; it does not collect tenant documents or complete a Right to Rent check. Landlords and agents remain responsible for meeting their legal obligations.',
  },
};

export function getProductCopy(slug: string): ProductCopy | undefined {
  return productCopy[slug];
}