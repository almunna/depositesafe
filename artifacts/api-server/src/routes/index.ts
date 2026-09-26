import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import accountRouter from "./account";
import transactionsRouter from "./transactions";
import adminRouter from "./admin";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(accountRouter);
router.use(transactionsRouter);
router.use(adminRouter);
router.use(webhooksRouter);

export default router;
