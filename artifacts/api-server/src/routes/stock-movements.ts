import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable, inventoryLogsTable, categoriesTable, locationsTable, systemSettingsTable } from "@workspace/db";
import { requirePermission } from "../middleware/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

const CreateStockMovementBody = z.object({
  productId: z.number().int().positive(),
  locationId: z.number().int().positive({ message: "A valid location is required." }),
  type: z.enum(["in", "out"]),
  quantity: z.number().int().positive(),
  notes: z.string().nullable().optional(),
  unitCost: z.number().positive().optional(),
});

router.post("/stock-movements", requirePermission("can_stock_in_out"), async (req, res): Promise<void> => {
  const parsed = CreateStockMovementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const { productId, locationId, type, quantity, notes, unitCost } = parsed.data;

  // Validate location exists
  const [location] = await db.select().from(locationsTable).where(eq(locationsTable.id, locationId));
  if (!location) {
    res.status(404).json({ error: "Location not found." });
    return;
  }

  const [current] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!current) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const opening = current.stock;
  const quantityChange = type === "in" ? quantity : -quantity;
  const closing = opening + quantityChange;

  if (closing < 0) {
    res.status(400).json({ error: `Cannot remove ${quantity} units. Only ${opening} in stock globally.` });
    return;
  }

  // Compute new price if weighted average costing is enabled and this is a stock-in with a unitCost
  let newPrice: string | undefined;
  if (type === "in" && unitCost !== undefined) {
    const [settings] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, 1));
    if (settings?.costingMethod === "weighted_average") {
      const currentPrice = Number(current.price);
      const weightedAvg = (opening * currentPrice + quantity * unitCost) / closing;
      newPrice = weightedAvg.toFixed(2);
    }
  }

  const [updated] = await db
    .update(productsTable)
    .set({ stock: closing, ...(newPrice !== undefined ? { price: newPrice } : {}) })
    .where(eq(productsTable.id, productId))
    .returning();

  await db.insert(inventoryLogsTable).values({
    productId,
    userId: req.user?.userId ?? null,
    locationId,
    type,
    quantityChange,
    openingBalance: opening,
    closingBalance: closing,
    notes: notes ?? null,
    unitCost: unitCost !== undefined ? String(unitCost) : null,
  });

  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, updated.categoryId));

  res.status(201).json({
    ...updated,
    categoryName: category?.name ?? "",
    skuPrefix: category?.skuPrefix ?? "",
    price: Number(updated.price),
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
