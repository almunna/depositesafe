import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, transactionsTable, userEmailsTable, usersTable, type Transaction } from "@workspace/db";
import { eq } from "drizzle-orm";

export type AuthenticatedRequest = Request & { userId: string };

export async function authorizeTransactionAccess(
  req: Request,
  res: Response,
  reference: string,
): Promise<Transaction | undefined> {
  const [transaction] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.reference, reference));
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return undefined;
  }

  const clerkUserId = optionalUserId(req);
  if (clerkUserId) {
    const localUser = await ensureLocalUser(clerkUserId);
    if (transaction.userId === localUser.id) return transaction;
  }

  const capability = req.header("x-guest-capability");
  if (capability && transaction.guestCapabilityHash) {
    const supplied = createHash("sha256").update(capability).digest();
    const expected = Buffer.from(transaction.guestCapabilityHash, "hex");
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      return transaction;
    }
  }

  res.status(403).json({ error: "Valid transaction access is required" });
  return undefined;
}

export function optionalUserId(req: Request): string | undefined {
  return getAuth(req).userId ?? undefined;
}

export const requireAuth: RequestHandler = (req, res, next): void => {
  const userId = optionalUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as AuthenticatedRequest).userId = userId;
  next();
};

export async function ensureLocalUser(clerkUserId: string, email?: string) {
  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });

  if (existing) {
    if (email) {
      const existingEmail = await db.query.userEmailsTable.findFirst({
        where: eq(userEmailsTable.email, email),
      });
      if (!existingEmail) {
        await db.insert(userEmailsTable).values({
          userId: existing.id,
          email,
          isPrimary: true,
          isVerified: true,
        });
      }
    }
    return existing;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      clerkUserId,
      displayName: email?.split("@")[0] || "DepositSafe customer",
    })
    .returning();

  if (email) {
    await db.insert(userEmailsTable).values({
      userId: created.id,
      email,
      isPrimary: true,
      isVerified: true,
    });
  }

  return created;
}

export async function getAccountEmail(clerkUserId: string): Promise<string | undefined> {
  try {
    const user = await clerkClient.users.getUser(clerkUserId);
    return user.primaryEmailAddress?.emailAddress;
  } catch {
    return undefined;
  }
}

export async function getPrimaryEmail(userId: string): Promise<string> {
  const email = await db.query.userEmailsTable.findFirst({
    where: eq(userEmailsTable.userId, userId),
  });
  return email?.email ?? "account@depositsafe.local";
}

function isAdminRoleClaim(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return "role" in value && value.role === "admin";
}

function hasAdminRoleClaim(claims: unknown): boolean {
  if (typeof claims !== "object" || claims === null) return false;
  const record = claims as Record<string, unknown>;
  return (
    record.role === "admin" ||
    record.org_role === "admin" ||
    isAdminRoleClaim(record.metadata) ||
    isAdminRoleClaim(record.public_metadata) ||
    isAdminRoleClaim(record.publicMetadata)
  );
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.REPLIT_DEPLOYMENT === "1" ||
    Boolean(process.env.WEB_REPL_RENEWAL && !process.env.REPL_IDENTITY)
  );
}

export async function isAdminRequest(req: Request, role: string): Promise<boolean> {
  if (!isProductionRuntime()) return true;
  return isStrictAdminRequest(req, role);
}

/** Administrator check with no development bypass, for provider-side and destructive actions. */
export async function isStrictAdminRequest(req: Request, role: string): Promise<boolean> {
  const auth = getAuth(req);
  if (role === "admin" || hasAdminRoleClaim(auth.sessionClaims)) return true;

  const configuredEmails = (process.env.DEPOSITSAFE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!auth.userId || configuredEmails.length === 0) return false;
  try {
    const user = await clerkClient.users.getUser(auth.userId);
    const primaryEmail = user.primaryEmailAddress;
    return Boolean(
      primaryEmail &&
      primaryEmail.verification?.status === "verified" &&
      configuredEmails.includes(primaryEmail.emailAddress.trim().toLowerCase()),
    );
  } catch {
    return false;
  }
}

export const requireStrictAdmin: RequestHandler = async (
  req,
  res,
  next: NextFunction,
): Promise<void> => {
  const userId = optionalUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await ensureLocalUser(userId);
  if (!(await isStrictAdminRequest(req, user.role))) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }

  (req as AuthenticatedRequest).userId = userId;
  next();
};

export const requireAdmin: RequestHandler = async (
  req,
  res,
  next: NextFunction,
): Promise<void> => {
  const userId = optionalUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await ensureLocalUser(userId);
  if (!(await isAdminRequest(req, user.role))) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }

  (req as AuthenticatedRequest).userId = userId;
  next();
};