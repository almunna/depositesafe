import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { webApp } from "./middlewares/webApp";
import { WebhookHandlers } from "./lib/webhookHandlers";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
// Set by the Docker image only. Mounted ahead of Clerk and the body parsers so
// page and asset requests never run through them.
const webRoot = process.env.DEPOSITSAFE_WEB_ROOT;
if (webRoot) app.use(webApp(webRoot));
app.use(cors());
app.post("/api/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const signature = req.header("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Stripe signature and raw request body are required." });
    return;
  }
  try {
    await WebhookHandlers.processWebhook(req.body, signature);
    res.json({ received: true });
  } catch (error) {
    const invalid = error instanceof Error && (error.name === "StripeSignatureVerificationError"
      || /signature|timestamp outside|environment mismatch/i.test(error.message));
    req.log.warn({ errorType: error instanceof Error ? error.name : "Unknown" }, "Stripe webhook rejected");
    res.status(invalid ? 400 : 503).json({ error: invalid ? "Invalid Stripe webhook signature or environment." : "Stripe event processing unavailable; delivery will be retried." });
  }
});
app.use(express.json({
  verify(req, _res, buffer) {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ error }, "Unhandled API error");
  res.status(500).json({ error: "An unexpected server error occurred." });
});

export default app;
