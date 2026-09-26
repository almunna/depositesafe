export const credasIntegration = {
  provider: "Credas",
  configured: false,
  async startVerification(): Promise<never> {
    throw new Error("Credas integration is reserved for a later build.");
  },
};