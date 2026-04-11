import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import productsRouter from "./products";
import categoriesRouter from "./categories";
import usersRouter from "./users";
import inventoryLogsRouter from "./inventory-logs";
import stockMovementsRouter from "./stock-movements";
import importRouter from "./import";
import locationsRouter from "./locations";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(productsRouter);
router.use(categoriesRouter);
router.use(usersRouter);
router.use(inventoryLogsRouter);
router.use(stockMovementsRouter);
router.use(importRouter);
router.use(locationsRouter);
router.use(settingsRouter);

export default router;
