import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import accountRouter from "./account";
import transactionsRouter from "./transactions";
import paymentsRouter from "./payments";
import adminRouter from "./admin";
import webhooksRouter from "./webhooks";
import contactRouter from "./contact";
import companiesHouseRouter from "./companies-house";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(accountRouter);
router.use(transactionsRouter);
router.use(paymentsRouter);
router.use(adminRouter);
router.use(webhooksRouter);
router.use(contactRouter);
router.use(companiesHouseRouter);

export default router;
