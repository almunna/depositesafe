import { Router, type IRouter } from "express";
import { and, count, desc, eq, gte } from "drizzle-orm";
import {
  ListAdminContactMessagesResponse,
  SubmitContactMessageBody,
  SubmitContactMessageResponse,
} from "@workspace/api-zod";
import { contactMessagesTable, db } from "@workspace/db";
import { ensureLocalUser, requireAdmin, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();
const contactBody = SubmitContactMessageBody.extend({
  name: SubmitContactMessageBody.shape.name.trim().min(1),
  email: SubmitContactMessageBody.shape.email.trim().toLowerCase(),
  message: SubmitContactMessageBody.shape.message.trim().min(10),
});

router.post("/contact-messages", async (req, res): Promise<void> => {
  const parsed = contactBody.safeParse(req.body);
  if (!parsed.success || parsed.data.website?.trim()) {
    res.status(400).json({ error: "Please provide your name, a valid email and a message of 10–4,000 characters." });
    return;
  }

  try {
    const [recent] = await db.select({ total: count() }).from(contactMessagesTable).where(
      and(
        eq(contactMessagesTable.email, parsed.data.email),
        gte(contactMessagesTable.createdAt, new Date(Date.now() - 15 * 60 * 1000)),
      ),
    );
    if (recent.total >= 3) {
      res.status(429).json({ error: "Please wait a little before sending another enquiry." });
      return;
    }
    const [message] = await db.insert(contactMessagesTable).values({
      name: parsed.data.name,
      email: parsed.data.email,
      topic: parsed.data.topic,
      message: parsed.data.message,
    }).returning({ id: contactMessagesTable.id });
    res.status(201).json(SubmitContactMessageResponse.parse({
      accepted: true,
      reference: message.id,
    }));
  } catch {
    req.log.error({ code: "CONTACT_STORAGE_UNAVAILABLE" }, "Contact enquiry could not be saved");
    res.status(503).json({ error: "We could not receive your enquiry right now. Please try again shortly." });
  }
});

router.get("/admin/contact-messages", requireAdmin, async (req, res): Promise<void> => {
  // Enquiries contain personal contact data: never accept an email header or
  // the development-mode admin fallback as authorization to read them.
  const user = await ensureLocalUser((req as AuthenticatedRequest).userId);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  const messages = await db.select().from(contactMessagesTable)
    .orderBy(desc(contactMessagesTable.createdAt)).limit(100);
  res.json(ListAdminContactMessagesResponse.parse(messages.map(({ id, ...message }) => ({
    reference: id,
    ...message,
  }))));
});

export default router;