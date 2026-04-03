import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable, inventoryLogsTable } from "@workspace/db";
import { CreateStockMovementBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/stock-movements", async (req, res): Promise<void> => {
  const parsed = CreateStockMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, type, quantity, notes } = parsed.data;

  if (quantity <= 0) {
    res.status(400).json({ error: "Quantity must be greater than 0." });
    return;
  }

  const [current] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!current) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const opening = current.stock;
  const quantityChange = type === "in" ? quantity : -quantity;
  const closing = opening + quantityChange;

  if (closing < 0) {
    res.status(400).json({
      error: `Cannot remove ${quantity} units. Only ${opening} in stock.`,
    });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({ stock: closing })
    .where(eq(productsTable.id, productId))
    .returning();

  await db.insert(inventoryLogsTable).values({
    productId,
    type,
    quantityChange,
    openingBalance: opening,
    closingBalance: closing,
    notes: notes ?? null,
  });

  res.status(201).json({
    ...updated,
    price: Number(updated.price),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
