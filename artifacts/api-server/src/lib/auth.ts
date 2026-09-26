import { getAuth } from "@clerk/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { db, userEmailsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type AuthenticatedRequest = Request & { userId: string };

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

export async function getPrimaryEmail(userId: string): Promise<string> {
  const email = await db.query.userEmailsTable.findFirst({
    where: eq(userEmailsTable.userId, userId),
  });
  return email?.email ?? "account@depositsafe.local";
}

export function isAdminRequest(req: Request, role: string): boolean {
  const auth = getAuth(req);
  const claimMetadata = auth.sessionClaims?.metadata;
  const claimRole =
    typeof claimMetadata === "object" &&
    claimMetadata !== null &&
    "role" in claimMetadata
      ? claimMetadata.role
      : undefined;
  const configuredEmails = (process.env.DEPOSITSAFE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const requestEmail = req.header("x-depositsafe-admin-email")?.toLowerCase();

  if (role === "admin" || claimRole === "admin") {
    return true;
  }
  if (requestEmail && configuredEmails.includes(requestEmail)) {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

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
  if (!isAdminRequest(req, user.role)) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }

  (req as AuthenticatedRequest).userId = userId;
  next();
};