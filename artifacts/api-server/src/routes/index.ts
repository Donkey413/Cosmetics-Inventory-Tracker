import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import inventoryLogsRouter from "./inventory-logs";
import stockMovementsRouter from "./stock-movements";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(inventoryLogsRouter);
router.use(stockMovementsRouter);

export default router;
