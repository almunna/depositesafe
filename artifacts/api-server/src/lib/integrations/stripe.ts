import { getStripeContext } from "@workspace/stripe";
export const stripeIntegration = {
  provider: "Stripe",
  configured: true,
  getContext: getStripeContext,
};