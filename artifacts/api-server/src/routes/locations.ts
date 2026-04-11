import { Router, type IRouter } from "express";
import { eq, sum } from "drizzle-orm";
import { db, locationsTable, inventoryLogsTable, productsTable, categoriesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middleware/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

const CreateLocationBody = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
});

const UpdateLocationBody = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).max(20).optional(),
});

function serializeLocation(l: typeof locationsTable.$inferSelect) {
  return {
    ...l,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

router.get("/locations", requireAuth, async (_req, res): Promise<void> => {
  const locations = await db.select().from(locationsTable).orderBy(locationsTable.name);
  res.json(locations.map(serializeLocation));
});

router.post("/locations", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [loc] = await db
      .insert(locationsTable)
      .values({ name: parsed.data.name, code: parsed.data.code.toUpperCase() })
      .returning();
    res.status(201).json(serializeLocation(loc));
  } catch {
    res.status(400).json({ error: "Location name or code already exists." });
  }
});

router.patch("/locations/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid location ID." }); return; }

  const parsed = UpdateLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.code !== undefined) updateData.code = parsed.data.code.toUpperCase();

  try {
    const [loc] = await db.update(locationsTable).set(updateData).where(eq(locationsTable.id, id)).returning();
    if (!loc) { res.status(404).json({ error: "Location not found." }); return; }
    res.json(serializeLocation(loc));
  } catch {
    res.status(400).json({ error: "Location name or code already exists." });
  }
});

router.delete("/locations/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid location ID." }); return; }

  const [loc] = await db.delete(locationsTable).where(eq(locationsTable.id, id)).returning();
  if (!loc) { res.status(404).json({ error: "Location not found." }); return; }
  res.sendStatus(204);
});

// GET /locations/:id/stock — per-product stock at this location (sum of quantityChanges)
router.get("/locations/:id/stock", requireAuth, async (req, res): Promise<void> => {
  const locationId = parseInt(req.params.id, 10);
  if (isNaN(locationId)) { res.status(400).json({ error: "Invalid location ID." }); return; }

  const rows = await db
    .select({
      productId: inventoryLogsTable.productId,
      productName: productsTable.name,
      productSku: productsTable.sku,
      categoryName: categoriesTable.name,
      unitOfMeasure: productsTable.unitOfMeasure,
      price: productsTable.price,
      lowStockThreshold: productsTable.lowStockThreshold,
      locationStock: sum(inventoryLogsTable.quantityChange),
    })
    .from(inventoryLogsTable)
    .innerJoin(productsTable, eq(inventoryLogsTable.productId, productsTable.id))
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(inventoryLogsTable.locationId, locationId))
    .groupBy(
      inventoryLogsTable.productId,
      productsTable.name,
      productsTable.sku,
      categoriesTable.name,
      productsTable.unitOfMeasure,
      productsTable.price,
      productsTable.lowStockThreshold,
    );

  res.json(
    rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      productSku: r.productSku,
      categoryName: r.categoryName,
      unitOfMeasure: r.unitOfMeasure,
      price: Number(r.price),
      lowStockThreshold: r.lowStockThreshold,
      locationStock: Number(r.locationStock ?? 0),
    })),
  );
});

export default router;
