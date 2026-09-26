export const stripeIntegration = {
  provider: "Stripe",
  configured: false,
  async createPaymentIntent(): Promise<never> {
    throw new Error("Stripe integration is reserved for a later build.");
  },
};