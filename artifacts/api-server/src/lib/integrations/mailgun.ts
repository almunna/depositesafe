export const mailgunIntegration = {
  provider: "Mailgun",
  configured: false,
  async sendNotification(): Promise<never> {
    throw new Error("Mailgun integration is reserved for a later build.");
  },
};