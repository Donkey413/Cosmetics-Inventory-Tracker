import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, categoriesTable, productsTable } from "@workspace/db";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

const CreateCategoryBody = z.object({
  name: z.string().min(1).max(100),
  skuPrefix: z.string().min(2).max(10),
});

const UpdateCategoryBody = z.object({
  name: z.string().min(1).max(100).optional(),
  skuPrefix: z.string().min(2).max(10).optional(),
});

function serializeCategory(c: typeof categoriesTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/categories", requireAuth, async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(categoriesTable.name);
  res.json(categories.map(serializeCategory));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [cat] = await db
      .insert(categoriesTable)
      .values({
        name: parsed.data.name,
        skuPrefix: parsed.data.skuPrefix.toUpperCase(),
      })
      .returning();
    res.status(201).json(serializeCategory(cat));
  } catch {
    res.status(400).json({ error: "Category name or SKU prefix already exists." });
  }
});

router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid category ID." });
    return;
  }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.skuPrefix !== undefined) updateData.skuPrefix = parsed.data.skuPrefix.toUpperCase();

  try {
    const [cat] = await db
      .update(categoriesTable)
      .set(updateData)
      .where(eq(categoriesTable.id, id))
      .returning();
    if (!cat) {
      res.status(404).json({ error: "Category not found." });
      return;
    }
    res.json(serializeCategory(cat));
  } catch {
    res.status(400).json({ error: "Category name or SKU prefix already exists." });
  }
});

router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid category ID." });
    return;
  }

  const products = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.categoryId, id))
    .limit(1);

  if (products.length > 0) {
    res.status(400).json({ error: "Cannot delete a category that has existing products." });
    return;
  }

  const [cat] = await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.id, id))
    .returning();

  if (!cat) {
    res.status(404).json({ error: "Category not found." });
    return;
  }

  res.sendStatus(204);
});

export default router;
