import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeedProducts } from "./lib/transactions";
import { initializeStripePayments } from "./lib/stripe-setup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  await ensureSeedProducts();
  try {
    await initializeStripePayments();
    logger.info("DepositSafe Stripe payments initialized for the runtime environment.");
  } catch (error) {
    logger.error({ message: error instanceof Error ? error.message : "Unknown" }, "Stripe payments unavailable; configuration must be resolved.");
  }
  logger.info({ port }, "Server listening");
});
