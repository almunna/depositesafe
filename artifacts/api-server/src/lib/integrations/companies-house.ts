export const companiesHouseIntegration = {
  provider: "Companies House",
  configured: false,
  async runCompanyCheck(): Promise<never> {
    throw new Error("Companies House integration is reserved for a later build.");
  },
};