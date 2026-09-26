import { Router, type IRouter } from "express";
import { ReceiveClerkWebhookBody, ReceiveClerkWebhookResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/webhooks/clerk", async (req, res): Promise<void> => {
  const parsed = ReceiveClerkWebhookBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  req.log.info({ eventType: parsed.data.type }, "Reserved Clerk webhook received");
  res.status(202).json(ReceiveClerkWebhookResponse.parse({ accepted: true }));
});

export default router;