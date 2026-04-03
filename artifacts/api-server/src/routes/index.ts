import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import inventoryLogsRouter from "./inventory-logs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(inventoryLogsRouter);

export default router;
