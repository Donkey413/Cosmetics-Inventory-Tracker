import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, inventoryLogsTable, productsTable } from "@workspace/db";
import { ListInventoryLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/inventory-logs", async (req, res): Promise<void> => {
  const parsed = ListInventoryLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select({
      id: inventoryLogsTable.id,
      productId: inventoryLogsTable.productId,
      productName: productsTable.name,
      productSku: productsTable.sku,
      productCategory: productsTable.category,
      type: inventoryLogsTable.type,
      quantityChange: inventoryLogsTable.quantityChange,
      openingBalance: inventoryLogsTable.openingBalance,
      closingBalance: inventoryLogsTable.closingBalance,
      notes: inventoryLogsTable.notes,
      createdAt: inventoryLogsTable.createdAt,
    })
    .from(inventoryLogsTable)
    .innerJoin(productsTable, eq(inventoryLogsTable.productId, productsTable.id))
    .orderBy(desc(inventoryLogsTable.createdAt));

  const filtered =
    parsed.data.productId != null
      ? rows.filter((r) => r.productId === parsed.data.productId)
      : rows;

  res.json(
    filtered.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export default router;
