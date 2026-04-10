import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productsTable, inventoryLogsTable, categoriesTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  CreateProductBody,
  GetProductParams,
  UpdateProductParams,
  UpdateProductBody,
  DeleteProductParams,
  UpdateProductStockParams,
  UpdateProductStockBody,
} from "@workspace/api-zod";
import { requireAuth, requirePermission } from "../middleware/requireAuth";

const router: IRouter = Router();

async function generateSku(categoryId: number, skuPrefix: string): Promise<string> {
  const existing = await db
    .select({ sku: productsTable.sku })
    .from(productsTable)
    .where(eq(productsTable.categoryId, categoryId));

  let maxNum = 0;
  for (const { sku } of existing) {
    const numPart = sku.slice(skuPrefix.length);
    const num = parseInt(numPart, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }

  return `${skuPrefix}${String(maxNum + 1).padStart(10, "0")}`;
}

async function getProductWithCategory(id: number) {
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      skuPrefix: categoriesTable.skuPrefix,
      description: productsTable.description,
      price: productsTable.price,
      unitOfMeasure: productsTable.unitOfMeasure,
      stock: productsTable.stock,
      lowStockThreshold: productsTable.lowStockThreshold,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
    })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, id));

  return rows[0] ?? null;
}

function serializeProduct(p: {
  id: number;
  name: string;
  sku: string;
  categoryId: number;
  categoryName: string;
  skuPrefix: string;
  description: string | null;
  price: string | number;
  unitOfMeasure: string;
  stock: number;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/products/summary", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: productsTable.id,
      price: productsTable.price,
      stock: productsTable.stock,
      lowStockThreshold: productsTable.lowStockThreshold,
    })
    .from(productsTable);

  const totalProducts = rows.length;
  const totalStock = rows.reduce((sum, p) => sum + p.stock, 0);
  const lowStockCount = rows.filter((p) => p.stock > 0 && p.stock < p.lowStockThreshold).length;
  const outOfStockCount = rows.filter((p) => p.stock === 0).length;
  const totalValue = rows.reduce((sum, p) => sum + Number(p.price) * p.stock, 0);

  res.json({
    totalProducts,
    totalStock,
    lowStockCount,
    outOfStockCount,
    totalValue: Math.round(totalValue * 100) / 100,
  });
});

router.get("/products/categories", requireAuth, async (_req, res): Promise<void> => {
  const categories = await db.select().from(categoriesTable);
  const products = await db
    .select({ categoryId: productsTable.categoryId, stock: productsTable.stock })
    .from(productsTable);

  const result = categories.map((cat) => {
    const catProducts = products.filter((p) => p.categoryId === cat.id);
    return {
      category: cat.name,
      categoryId: cat.id,
      skuPrefix: cat.skuPrefix,
      count: catProducts.length,
      totalStock: catProducts.reduce((sum, p) => sum + p.stock, 0),
    };
  });

  res.json(result);
});

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { category, search, lowStock } = parsed.data;

  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      skuPrefix: categoriesTable.skuPrefix,
      description: productsTable.description,
      price: productsTable.price,
      unitOfMeasure: productsTable.unitOfMeasure,
      stock: productsTable.stock,
      lowStockThreshold: productsTable.lowStockThreshold,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
    })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id));

  let products = rows;

  if (category) {
    products = products.filter((p) => p.categoryName === category);
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

router.post("/products", requirePermission("can_manage_products"), async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [category] = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.id, parsed.data.categoryId));

  if (!category) {
    res.status(400).json({ error: "Category not found." });
    return;
  }

  const sku = await generateSku(category.id, category.skuPrefix);

  const [product] = await db
    .insert(productsTable)
    .values({
      name: parsed.data.name,
      sku,
      categoryId: parsed.data.categoryId,
      description: parsed.data.description ?? null,
      price: String(parsed.data.price),
      unitOfMeasure: parsed.data.unitOfMeasure ?? "pcs",
      stock: parsed.data.stock ?? 0,
      lowStockThreshold: parsed.data.lowStockThreshold ?? 10,
    })
    .returning();

  if (product.stock > 0) {
    await db.insert(inventoryLogsTable).values({
      productId: product.id,
      userId: req.user?.userId ?? null,
      type: "initial",
      quantityChange: product.stock,
      openingBalance: 0,
      closingBalance: product.stock,
      notes: "Initial stock on product creation",
    });
  }

  const withCategory = await getProductWithCategory(product.id);
  res.status(201).json(serializeProduct(withCategory!));
});

router.get("/products/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const product = await getProductWithCategory(params.data.id);
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  res.json(serializeProduct(product));
});

router.patch("/products/:id", requirePermission("can_manage_products"), async (req, res): Promise<void> => {
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

  const updateData: Record<string, unknown> = { ...parsed.data };
  if ("price" in parsed.data && parsed.data.price !== undefined) {
    updateData.price = String(parsed.data.price);
  }

  const [updated] = await db
    .update(productsTable)
    .set(updateData)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const withCategory = await getProductWithCategory(updated.id);
  res.json(serializeProduct(withCategory!));
});

// Direct stock adjustment — records ledger entry
router.patch("/products/:id/stock", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateProductStockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProductStockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [current] = await db
    .select({ stock: productsTable.stock })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!current) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const opening = current.stock;
  const closing = parsed.data.stock;
  const difference = closing - opening;

  const [updated] = await db
    .update(productsTable)
    .set({ stock: closing })
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (difference !== 0) {
    await db.insert(inventoryLogsTable).values({
      productId: params.data.id,
      userId: req.user?.userId ?? null,
      type: "adjustment",
      quantityChange: difference,
      openingBalance: opening,
      closingBalance: closing,
      notes: parsed.data.notes ?? `Manual stock adjustment`,
    });
  }

  const withCategory = await getProductWithCategory(updated.id);
  res.json(serializeProduct(withCategory!));
});

router.delete("/products/:id", requirePermission("can_manage_products"), async (req, res): Promise<void> => {
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
    res.status(404).json({ error: "Product not found." });
    return;
  }

  res.sendStatus(204);
});

export default router;
