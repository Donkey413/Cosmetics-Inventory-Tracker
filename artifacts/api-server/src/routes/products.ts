import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable, inventoryLogsTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  CreateProductBody,
  GetProductParams,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
  UpdateStockParams,
  UpdateStockBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products/summary", async (req, res): Promise<void> => {
  const products = await db.select().from(productsTable);

  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStockCount = products.filter(
    (p) => p.stock > 0 && p.stock < p.lowStockThreshold,
  ).length;
  const outOfStockCount = products.filter((p) => p.stock === 0).length;
  const totalValue = products.reduce(
    (sum, p) => sum + Number(p.price) * p.stock,
    0,
  );

  res.json({
    totalProducts,
    totalStock,
    lowStockCount,
    outOfStockCount,
    totalValue: Math.round(totalValue * 100) / 100,
  });
});

router.get("/products/categories", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable);

  const categoryMap = new Map<string, { count: number; totalStock: number }>();
  for (const p of products) {
    const existing = categoryMap.get(p.category) ?? { count: 0, totalStock: 0 };
    categoryMap.set(p.category, {
      count: existing.count + 1,
      totalStock: existing.totalStock + p.stock,
    });
  }

  const categories = Array.from(categoryMap.entries()).map(
    ([category, data]) => ({
      category,
      count: data.count,
      totalStock: data.totalStock,
    }),
  );

  res.json(categories);
});

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { category, search, lowStock } = parsed.data;

  let products = await db.select().from(productsTable);

  if (category) {
    products = products.filter((p) => p.category === category);
  }

  if (search) {
    const lowerSearch = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerSearch) ||
        p.sku.toLowerCase().includes(lowerSearch),
    );
  }

  if (lowStock === true || (lowStock as unknown as string) === "true") {
    products = products.filter((p) => p.stock < p.lowStockThreshold);
  }

  res.json(products.map(serializeProduct));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      ...parsed.data,
      price: String(parsed.data.price),
    })
    .returning();

  // Record initial stock log entry if stock > 0
  if (product.stock > 0) {
    await db.insert(inventoryLogsTable).values({
      productId: product.id,
      type: "initial",
      quantityChange: product.stock,
      openingBalance: 0,
      closingBalance: product.stock,
      notes: "Initial stock on product creation",
    });
  }

  res.status(201).json(serializeProduct(product));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(serializeProduct(product));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Get current product to detect stock changes
  const [current] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!current) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) {
    updateData.price = String(parsed.data.price);
  }

  const [product] = await db
    .update(productsTable)
    .set(updateData)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Log stock change if stock was modified
  if (parsed.data.stock !== undefined && parsed.data.stock !== current.stock) {
    const opening = current.stock;
    const closing = product.stock;
    const change = closing - opening;
    await db.insert(inventoryLogsTable).values({
      productId: product.id,
      type: change > 0 ? "in" : "out",
      quantityChange: change,
      openingBalance: opening,
      closingBalance: closing,
      notes: "Stock updated via product edit",
    });
  }

  res.json(serializeProduct(product));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.sendStatus(204);
});

router.patch("/products/:id/stock", async (req, res): Promise<void> => {
  const params = UpdateStockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateStockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [current] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!current) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const opening = current.stock;
  const closing = parsed.data.stock;
  const change = closing - opening;

  if (change === 0) {
    res.json(serializeProduct(current));
    return;
  }

  const [product] = await db
    .update(productsTable)
    .set({ stock: closing })
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Record the movement in the log
  await db.insert(inventoryLogsTable).values({
    productId: product.id,
    type: change > 0 ? "in" : "out",
    quantityChange: change,
    openingBalance: opening,
    closingBalance: closing,
    notes: (parsed.data as { stock: number; notes?: string | null }).notes ?? null,
  });

  res.json(serializeProduct(product));
});

function serializeProduct(p: typeof productsTable.$inferSelect) {
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;
