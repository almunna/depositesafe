import { getStripeSync, stripeMode } from "@workspace/stripe";
import type Stripe from "stripe";
import { reconcileStripePaymentEvent } from "./payments";
import { initializeStripePayments } from "./stripe-setup";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    if (!Buffer.isBuffer(payload)) throw new Error("Stripe webhook requires the raw request body.");
    await initializeStripePayments();
    const sync = await getStripeSync();
    // The managed sync library verifies the signature before any app event parsing/update.
    await sync.processWebhook(payload, signature);
    const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;
    if (event.livemode !== (stripeMode() === "live")) throw new Error("Stripe webhook environment mismatch.");
    await reconcileStripePaymentEvent(event);
  }
}