import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  LOCKED_PRODUCTS,
  STRIPE_ACCOUNTS,
  getStripeContext,
  stripeMode,
  type StripeMode,
} from "@workspace/stripe";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  paymentsTable,
  productConfigurationsTable,
  providerEventsTable,
  transactionsTable,
} from "@workspace/db";
import { initializeStripePayments } from "./stripe-setup";

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export type CheckoutUrls = { successUrl: string; cancelUrl: string };

function configuredOrigin(value: string): { origin: string } | undefined {
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const url = new URL(candidate);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return { origin: url.origin };
  } catch {
    return undefined;
  }
}

export function trustedCheckoutOrigins(env: NodeJS.ProcessEnv = process.env): {
  origins: Set<string>;
  preferredOrigin?: string;
} {
  const production =
    env.NODE_ENV === "production" ||
    env.REPLIT_DEPLOYMENT === "1" ||
    Boolean(env.WEB_REPL_RENEWAL && !env.REPL_IDENTITY);
  let configured = configuredOrigin(env.DEPOSITSAFE_PUBLIC_ORIGIN ?? "");
  if (production && configured && !configured.origin.startsWith("https://")) configured = undefined;
  const domainValues = production
    ? (env.REPLIT_DOMAINS ?? "").split(",")
    : [env.REPLIT_DEV_DOMAIN ?? ""];
  const origins = new Set<string>();
  if (configured) origins.add(configured.origin);
  for (const value of domainValues) {
    const domain = configuredOrigin(value.trim());
    if (domain && (!production || domain.origin.startsWith("https://"))) origins.add(domain.origin);
  }
  return {
    origins,
    preferredOrigin: configured?.origin ?? origins.values().next().value,
  };
}

function checkoutPathMatchesReference(pathname: string, reference: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length >= 2 &&
    segments.at(-2) === "transactions" &&
    segments.at(-1) === encodeURIComponent(reference)
  );
}

export function validateCheckoutReturnUrls(
  urls: CheckoutUrls,
  reference: string,
  requestOrigin?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): CheckoutUrls {
  const trusted = trustedCheckoutOrigins(env);
  let selectedOrigin = trusted.preferredOrigin;
  if (requestOrigin) {
    let origin: string;
    try {
      const parsedOrigin = new URL(requestOrigin);
      if (parsedOrigin.origin !== requestOrigin) {
        throw new Error("Origin must not contain a path or credentials.");
      }
      origin = parsedOrigin.origin;
    } catch {
      throw new PaymentError("The checkout origin is not trusted.", 400);
    }
    if (!trusted.origins.has(origin)) {
      throw new PaymentError("The checkout origin is not trusted.", 400);
    }
    selectedOrigin = origin;
  }
  if (!selectedOrigin || trusted.origins.size === 0) {
    throw new PaymentError("A trusted public application origin is not configured.", 500);
  }

  const validate = (value: string): string => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new PaymentError("Checkout return URLs must be absolute trusted application URLs.", 400);
    }
    if (
      url.origin !== selectedOrigin ||
      url.username ||
      url.password ||
      !checkoutPathMatchesReference(url.pathname, reference)
    ) {
      throw new PaymentError("Checkout return URLs must point to this transaction on the trusted application origin.", 400);
    }
    return url.toString();
  };

  return { successUrl: validate(urls.successUrl), cancelUrl: validate(urls.cancelUrl) };
}

export function stripeCheckoutIdempotencyKey(
  transactionId: string,
  mode: StripeMode,
  clientKey: string,
  attempt: number,
): string {
  const keyDigest = createHash("sha256").update(clientKey).digest("hex").slice(0, 40);
  return `depositsafe:${transactionId}:${mode}:${keyDigest}:${attempt}`;
}

export function deterministicPaymentId(idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32).split("");
  digest[12] = "5";
  digest[16] = (parseInt(digest[16], 16) & 0x3 | 0x8).toString(16);
  const hex = digest.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isSuccessfulCheckoutPaymentEvent(
  eventType: string,
  paymentStatus: string | null | undefined,
): boolean {
  return (
    paymentStatus === "paid" &&
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(eventType)
  );
}

export function shouldApplyPaymentEvent(
  occurredAt: Date,
  lastProviderEventAt: Date | null,
  isPaidEvent: boolean,
): boolean {
  return isPaidEvent || !lastProviderEventAt || occurredAt >= lastProviderEventAt;
}

export function shouldMarkTransactionPaymentFailed(
  eventPaymentId: string,
  latestPaymentId: string | undefined,
): boolean {
  return eventPaymentId === latestPaymentId;
}

function latestEventTime(previous: Date | null, current: Date): Date {
  return previous && previous > current ? previous : current;
}

export function isPostPaymentTransactionStatus(status: string): boolean {
  return [
    "PAID",
    "VERIFICATION_PENDING",
    "VERIFICATION_IN_PROGRESS",
    "VERIFICATION_COMPLETED",
    "RESULT_GENERATED",
    "DELIVERED",
    "AWAITING_PARTICIPANT",
    "VERIFICATION_FAILED",
    "MANUAL_ATTENTION",
  ].includes(status);
}

function publicCheckoutResult(
  session: Stripe.Checkout.Session,
  amountPence: number,
) {
  if (!session.url) {
    throw new PaymentError("Stripe returned a checkout session without a secure checkout URL.", 502);
  }
  return {
    checkoutSessionReference: session.id,
    checkoutUrl: session.url,
    paymentStatus: "pending" as const,
    amountPence,
  };
}

function lockedProductForSlug(slug: string) {
  return LOCKED_PRODUCTS.find((product) => product.slug === slug);
}

async function validateStripePrice(
  stripe: Stripe,
  accountId: string,
  mode: StripeMode,
  product: typeof productConfigurationsTable.$inferSelect,
) {
  const locked = lockedProductForSlug(product.slug);
  if (
    !locked ||
    !product.active ||
    product.name !== locked.name ||
    product.pricePence !== locked.amount
  ) {
    throw new PaymentError("This product does not match the locked DepositSafe price catalogue.", 409);
  }

  const productId = mode === "live" ? product.stripeProductId : product.stripeSandboxProductId;
  const priceId = mode === "live" ? product.stripePriceId : product.stripeSandboxPriceId;
  if (!productId || !priceId) {
    throw new PaymentError(`The ${mode} Stripe price for this product is not configured.`, 503);
  }

  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(
      priceId,
      { expand: ["product"] },
      { stripeAccount: accountId },
    );
  } catch {
    throw new PaymentError(`The configured ${mode} Stripe price could not be retrieved.`, 503);
  }
  let stripeProduct: Stripe.Product | Stripe.DeletedProduct;
  if (typeof price.product === "string") {
    try {
      stripeProduct = await stripe.products.retrieve(
        price.product,
        {},
        { stripeAccount: accountId },
      );
    } catch {
      throw new PaymentError("The configured Stripe product could not be retrieved.", 503);
    }
  } else {
    stripeProduct = price.product;
  }
  if (
    !price.active ||
    price.currency.toLowerCase() !== "gbp" ||
    price.unit_amount !== locked.amount ||
    price.livemode !== (mode === "live") ||
    price.type !== "one_time" ||
    Boolean(price.custom_unit_amount) ||
    stripeProduct.deleted ||
    stripeProduct.id !== productId ||
    stripeProduct.name !== locked.name ||
    stripeProduct.active !== true ||
    stripeProduct.livemode !== (mode === "live")
  ) {
    throw new PaymentError("The configured Stripe price does not match the active locked GBP product.", 409);
  }
  return { locked, price };
}

function sessionPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

export async function createCheckoutSession(
  reference: string,
  body: {
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
  },
  requestOrigin?: string | null,
) {
  const urls = validateCheckoutReturnUrls(
    { successUrl: body.successUrl, cancelUrl: body.cancelUrl },
    reference,
    requestOrigin,
  );
  const mode = stripeMode();
  try {
    await initializeStripePayments();
  } catch {
    throw new PaymentError("Stripe payments are temporarily unavailable while payment setup is verified.", 503);
  }
  const { stripe, accountId } = await getStripeContext(mode);

  return db.transaction(async (tx) => {
    const [transaction] = await tx
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.reference, reference))
      .limit(1);
    if (!transaction) throw new PaymentError("Transaction not found.", 404);

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${transaction.id}, 0))`);
    const [lockedTransaction] = await tx
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transaction.id))
      .limit(1);
    if (!lockedTransaction) throw new PaymentError("Transaction not found.", 404);

    const [product] = await tx
      .select()
      .from(productConfigurationsTable)
      .where(eq(productConfigurationsTable.id, lockedTransaction.productId))
      .limit(1);
    if (!product) throw new PaymentError("The transaction product is unavailable.", 409);
    const { locked, price } = await validateStripePrice(stripe, accountId, mode, product);

    const attempts = await tx
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.transactionId, lockedTransaction.id), eq(paymentsTable.provider, "stripe")))
      .orderBy(desc(paymentsTable.createdAt));
    if (attempts.some((payment) => payment.status === "paid") || isPostPaymentTransactionStatus(lockedTransaction.status)) {
      throw new PaymentError("This transaction has already been paid or has moved beyond payment.", 409);
    }
    if (attempts.some((payment) => !["pending", "failed", "expired"].includes(payment.status))) {
      throw new PaymentError("An existing payment attempt is in an unexpected state.", 409);
    }
    if (!["STARTED", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(lockedTransaction.status)) {
      throw new PaymentError("This transaction cannot accept payment in its current state.", 409);
    }
    if (
      lockedTransaction.status === "PAYMENT_PENDING" &&
      !attempts.some((payment) => payment.status === "pending")
    ) {
      throw new PaymentError("The transaction has an unexpected payment-pending state.", 409);
    }

    for (const attempt of attempts) {
      if (attempt.status !== "pending") continue;
      if (!attempt.checkoutSessionReference) {
        throw new PaymentError("An existing payment attempt is in an unexpected state.", 409);
      }
      let existingSession: Stripe.Checkout.Session;
      try {
        existingSession = await stripe.checkout.sessions.retrieve(
          attempt.checkoutSessionReference,
          {},
          { stripeAccount: accountId },
        );
      } catch {
        throw new PaymentError("An existing Stripe checkout could not be verified.", 503);
      }
      if (existingSession.payment_status === "paid") {
        throw new PaymentError("Payment confirmation is being reconciled. Please refresh this transaction.", 409);
      }
      if (existingSession.status === "open") {
        return publicCheckoutResult(existingSession, locked.amount);
      }
      if (existingSession.status !== "expired") {
        throw new PaymentError("An existing checkout is complete but payment is not confirmed; a second charge is blocked.", 409);
      }
      await tx
        .update(paymentsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(paymentsTable.id, attempt.id));
    }

    const idempotencyKey = stripeCheckoutIdempotencyKey(
      lockedTransaction.id,
      mode,
      body.idempotencyKey,
      attempts.length,
    );
    const [payment] = await tx
      .insert(paymentsTable)
      .values({
        id: deterministicPaymentId(idempotencyKey),
        transactionId: lockedTransaction.id,
        provider: "stripe",
        idempotencyKey,
        amountPence: locked.amount,
        status: "pending",
      })
      .returning();
    const metadata = {
      paymentId: payment.id,
      transactionId: lockedTransaction.id,
      transactionReference: lockedTransaction.reference,
      productSlug: locked.slug,
      amountPence: String(locked.amount),
      mode,
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [{ price: price.id, quantity: 1 }],
          success_url: urls.successUrl,
          cancel_url: urls.cancelUrl,
          customer_email: lockedTransaction.guestEmail,
          client_reference_id: lockedTransaction.reference,
          metadata,
          payment_intent_data: { metadata },
        },
        { idempotencyKey, stripeAccount: accountId },
      );
    } catch {
      throw new PaymentError("Stripe could not create a secure checkout session. Please try again.", 502);
    }
    if (
      session.mode !== "payment" ||
      session.livemode !== (mode === "live") ||
      !session.url
    ) {
      throw new PaymentError("Stripe returned an unexpected checkout session.", 502);
    }

    await tx
      .update(paymentsTable)
      .set({
        checkoutSessionReference: session.id,
        paymentIntentReference: sessionPaymentIntentId(session),
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, payment.id));
    if (lockedTransaction.status !== "PAYMENT_PENDING") {
      await tx
        .update(transactionsTable)
        .set({ status: "PAYMENT_PENDING", statusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(transactionsTable.id, lockedTransaction.id));
    }
    return publicCheckoutResult(session, locked.amount);
  });
}

function stripeObjectId(value: string | { id: string } | null | undefined): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function eventPayloadSummary(event: Stripe.Event): Record<string, unknown> {
  const object = event.data.object as { id?: string; payment_status?: string; amount_total?: number | null; currency?: string | null };
  return {
    livemode: event.livemode,
    objectId: object.id ?? null,
    ...(object.payment_status ? { paymentStatus: object.payment_status } : {}),
    ...(typeof object.amount_total === "number" ? { amountTotal: object.amount_total } : {}),
    ...(object.currency ? { currency: object.currency } : {}),
  };
}

function safePaymentEventError(): PaymentError {
  return new PaymentError("Stripe payment event could not be safely reconciled.", 409);
}

export async function reconcileStripePaymentEvent(event: Stripe.Event): Promise<void> {
  let processingFailed = false;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`stripe-event:${event.id}`}, 0))`);
    const now = new Date();
    const occurredAt = new Date(event.created * 1000);
    const [inserted] = await tx
      .insert(providerEventsTable)
      .values({
        provider: "stripe",
        externalEventId: event.id,
        eventType: event.type,
        occurredAt,
        payload: eventPayloadSummary(event),
        processingStatus: "processing",
      })
      .onConflictDoNothing()
      .returning();

    const [storedEvent] = inserted
      ? [inserted]
      : await tx
          .select()
          .from(providerEventsTable)
          .where(and(eq(providerEventsTable.provider, "stripe"), eq(providerEventsTable.externalEventId, event.id)))
          .limit(1);
    if (!storedEvent) throw safePaymentEventError();
    if (!inserted && storedEvent.processingStatus === "processed") return;
    await tx
      .update(providerEventsTable)
      .set({
        processingStatus: "processing",
        processingError: null,
        processedAt: null,
      })
      .where(eq(providerEventsTable.id, storedEvent.id));

    try {
      const mode = stripeMode();
      if (event.livemode !== (mode === "live")) throw safePaymentEventError();
      if (event.account && event.account !== STRIPE_ACCOUNTS[mode]) throw safePaymentEventError();

      const handledSessionEvent = [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
      ].includes(event.type);
      if (!handledSessionEvent) {
        await tx
          .update(providerEventsTable)
          .set({ processingStatus: "processed", processedAt: now })
          .where(eq(providerEventsTable.id, storedEvent.id));
        return;
      }

      const session = event.data.object as Stripe.Checkout.Session;
      const [matchedPayment] = await tx
        .select()
        .from(paymentsTable)
        .where(and(eq(paymentsTable.provider, "stripe"), eq(paymentsTable.checkoutSessionReference, session.id)))
        .limit(1);
      if (!matchedPayment) {
        if (session.metadata?.paymentId) throw safePaymentEventError();
        await tx
          .update(providerEventsTable)
          .set({
            processingStatus: "processed",
            processingError: "No persisted payment session matched this event.",
            externalReference: session.id,
            processedAt: now,
          })
          .where(eq(providerEventsTable.id, storedEvent.id));
        return;
      }

      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${matchedPayment.transactionId}, 0))`);
      const [payment] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.id, matchedPayment.id))
        .limit(1);
      if (!payment || payment.transactionId !== matchedPayment.transactionId) {
        throw safePaymentEventError();
      }
      const attempts = await tx
        .select()
        .from(paymentsTable)
        .where(and(eq(paymentsTable.transactionId, payment.transactionId), eq(paymentsTable.provider, "stripe")))
        .orderBy(desc(paymentsTable.createdAt), desc(paymentsTable.id));
      const latestPaymentId = attempts[0]?.id;
      const [transaction] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, payment.transactionId))
        .limit(1);
      const [product] = transaction
        ? await tx
            .select()
            .from(productConfigurationsTable)
            .where(eq(productConfigurationsTable.id, transaction.productId))
            .limit(1)
        : [];
      const locked = product ? lockedProductForSlug(product.slug) : undefined;
      const metadata = session.metadata ?? {};
      const expectedMode = mode === "live" ? "live" : "test";
      if (
        !transaction ||
        !product ||
        !locked ||
        product.name !== locked.name ||
        product.pricePence !== locked.amount ||
        payment.amountPence !== locked.amount ||
        session.livemode !== (mode === "live") ||
        session.mode !== "payment" ||
        session.client_reference_id !== transaction.reference ||
        (event.type === "checkout.session.expired"
          ? session.status !== "expired"
          : session.status !== "complete") ||
        session.amount_total !== locked.amount ||
        session.currency?.toLowerCase() !== "gbp" ||
        metadata.paymentId !== payment.id ||
        metadata.transactionId !== transaction.id ||
        metadata.transactionReference !== transaction.reference ||
        metadata.productSlug !== locked.slug ||
        metadata.amountPence !== String(locked.amount) ||
        metadata.mode !== expectedMode ||
        stripeObjectId(session.payment_intent) &&
          payment.paymentIntentReference &&
          stripeObjectId(session.payment_intent) !== payment.paymentIntentReference
      ) {
        throw safePaymentEventError();
      }

      const successfulPaymentEvent = isSuccessfulCheckoutPaymentEvent(
        event.type,
        session.payment_status,
      );
      const applyEvent = shouldApplyPaymentEvent(
        occurredAt,
        payment.lastProviderEventAt,
        successfulPaymentEvent,
      );
      const intentId = stripeObjectId(session.payment_intent) ?? payment.paymentIntentReference;
      if (successfulPaymentEvent) {
        if (payment.status !== "paid") {
          await tx
            .update(paymentsTable)
            .set({
              status: "paid",
              paymentIntentReference: intentId,
              lastProviderEventAt: latestEventTime(payment.lastProviderEventAt, occurredAt),
              updatedAt: now,
            })
            .where(eq(paymentsTable.id, payment.id));
        } else if (applyEvent) {
          await tx
            .update(paymentsTable)
            .set({
              lastProviderEventAt: latestEventTime(payment.lastProviderEventAt, occurredAt),
              updatedAt: now,
            })
            .where(eq(paymentsTable.id, payment.id));
        }
        if (!isPostPaymentTransactionStatus(transaction.status)) {
          await tx
            .update(transactionsTable)
            .set({ status: "PAID", statusChangedAt: now, updatedAt: now })
            .where(eq(transactionsTable.id, transaction.id));
        }
      } else if (
        applyEvent &&
        (event.type === "checkout.session.async_payment_failed" ||
          event.type === "checkout.session.expired")
      ) {
        if (payment.status !== "paid") {
          await tx
            .update(paymentsTable)
            .set({
              status: event.type.endsWith(".expired") ? "expired" : "failed",
              paymentIntentReference: intentId,
              lastProviderEventAt: latestEventTime(payment.lastProviderEventAt, occurredAt),
              updatedAt: now,
            })
            .where(eq(paymentsTable.id, payment.id));
        }
        if (
          payment.status !== "paid" &&
          shouldMarkTransactionPaymentFailed(payment.id, latestPaymentId) &&
          !isPostPaymentTransactionStatus(transaction.status) &&
          transaction.status !== "EXPIRED" &&
          transaction.status !== "VERIFICATION_FAILED" &&
          transaction.status !== "PAYMENT_FAILED"
        ) {
          await tx
            .update(transactionsTable)
            .set({ status: "PAYMENT_FAILED", statusChangedAt: now, updatedAt: now })
            .where(eq(transactionsTable.id, transaction.id));
        }
      }

      await tx
        .update(providerEventsTable)
        .set({
          processingStatus: "processed",
          externalReference: session.id,
          transactionId: transaction.id,
          processedAt: now,
        })
        .where(eq(providerEventsTable.id, storedEvent.id));
    } catch {
      processingFailed = true;
      await tx
        .update(providerEventsTable)
        .set({
          processingStatus: "error",
          processingError: "Payment event validation or reconciliation failed.",
          processedAt: now,
        })
        .where(eq(providerEventsTable.id, storedEvent.id));
    }
  });

  if (processingFailed) throw safePaymentEventError();
}
