import { Router, type IRouter } from "express";
import { eq, desc, gte, lte, and } from "drizzle-orm";
import { db, inventoryLogsTable, productsTable, categoriesTable, usersTable } from "@workspace/db";
import { ListInventoryLogsQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middleware/requireAuth";

const router: IRouter = Router();

router.get("/inventory-logs", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListInventoryLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, from, to } = parsed.data;

  const conditions = [];

  if (productId != null) {
    conditions.push(eq(inventoryLogsTable.productId, productId));
  }

  if (from) {
    const fromDate = new Date(from as string);
    fromDate.setHours(0, 0, 0, 0);
    conditions.push(gte(inventoryLogsTable.createdAt, fromDate));
  }

  if (to) {
    const toDate = new Date(to as string);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(inventoryLogsTable.createdAt, toDate));
  }

  const rows = await db
    .select({
      id: inventoryLogsTable.id,
      productId: inventoryLogsTable.productId,
      productName: productsTable.name,
      productSku: productsTable.sku,
      productCategory: categoriesTable.name,
      userId: inventoryLogsTable.userId,
      userName: usersTable.username,
      type: inventoryLogsTable.type,
      quantityChange: inventoryLogsTable.quantityChange,
      openingBalance: inventoryLogsTable.openingBalance,
      closingBalance: inventoryLogsTable.closingBalance,
      notes: inventoryLogsTable.notes,
      createdAt: inventoryLogsTable.createdAt,
    })
    .from(inventoryLogsTable)
    .innerJoin(productsTable, eq(inventoryLogsTable.productId, productsTable.id))
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(usersTable, eq(inventoryLogsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryLogsTable.createdAt));

  res.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export default router;
