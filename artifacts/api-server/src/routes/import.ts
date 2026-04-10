import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, categoriesTable, productsTable, inventoryLogsTable } from "@workspace/db";
import { requireAuth, requirePermission } from "../middleware/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

const ImportProductRow = z.object({
  categoryName: z.string().min(1),
  productName: z.string().min(1),
  unitOfMeasure: z.string().min(1),
  unitCost: z.number().positive(),
});

const ImportProductsBody = z.object({
  rows: z.array(ImportProductRow),
});

const ImportCountRow = z.object({
  sku: z.string().min(1),
  physicalCount: z.number().min(0),
});

const ImportCountBody = z.object({
  rows: z.array(ImportCountRow),
});

async function generateSku(categoryId: number, skuPrefix: string): Promise<string> {
  const existingProducts = await db
    .select({ sku: productsTable.sku })
    .from(productsTable)
    .where(eq(productsTable.categoryId, categoryId));

  let maxNum = 0;
  for (const { sku } of existingProducts) {
    const numPart = sku.slice(skuPrefix.length);
    const num = parseInt(numPart, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }

  return `${skuPrefix}${String(maxNum + 1).padStart(10, "0")}`;
}

// POST /import/products/preview
router.post(
  "/import/products/preview",
  requirePermission("can_batch_upload"),
  async (req, res): Promise<void> => {
    const parsed = ImportProductsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const categories = await db.select().from(categoriesTable);
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

    // Track SKU counters per category within this import batch
    const skuCounters = new Map<number, number>();

    const preview = await Promise.all(
      parsed.data.rows.map(async (row, index) => {
        const rowNumber = index + 1;
        const cat = categoryMap.get(row.categoryName.toLowerCase());

        if (!cat) {
          return {
            rowNumber,
            categoryName: row.categoryName,
            productName: row.productName,
            unitOfMeasure: row.unitOfMeasure,
            unitCost: row.unitCost,
            status: "error" as const,
            error: `Category "${row.categoryName}" does not exist. Create it first.`,
          };
        }

        if (!row.productName.trim()) {
          return {
            rowNumber,
            categoryName: row.categoryName,
            productName: row.productName,
            unitOfMeasure: row.unitOfMeasure,
            unitCost: row.unitCost,
            status: "error" as const,
            error: "Product name cannot be empty.",
          };
        }

        if (row.unitCost <= 0) {
          return {
            rowNumber,
            categoryName: row.categoryName,
            productName: row.productName,
            unitOfMeasure: row.unitOfMeasure,
            unitCost: row.unitCost,
            status: "error" as const,
            error: "Unit cost must be greater than 0.",
          };
        }

        // Calculate next SKU considering already-committed products + batch offset
        const existingProducts = await db
          .select({ sku: productsTable.sku })
          .from(productsTable)
          .where(eq(productsTable.categoryId, cat.id));

        let maxNum = 0;
        for (const { sku } of existingProducts) {
          const numPart = sku.slice(cat.skuPrefix.length);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }

        const batchOffset = skuCounters.get(cat.id) ?? 0;
        skuCounters.set(cat.id, batchOffset + 1);
        const nextNum = maxNum + batchOffset + 1;
        const generatedSku = `${cat.skuPrefix}${String(nextNum).padStart(10, "0")}`;

        return {
          rowNumber,
          categoryName: row.categoryName,
          productName: row.productName,
          unitOfMeasure: row.unitOfMeasure,
          unitCost: row.unitCost,
          generatedSku,
          status: "new" as const,
        };
      }),
    );

    res.json(preview);
  },
);

// POST /import/products/commit
router.post(
  "/import/products/commit",
  requirePermission("can_batch_upload"),
  async (req, res): Promise<void> => {
    const parsed = ImportProductsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const categories = await db.select().from(categoriesTable);
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

    const errors: string[] = [];
    const created: unknown[] = [];

    for (const row of parsed.data.rows) {
      const cat = categoryMap.get(row.categoryName.toLowerCase());
      if (!cat) {
        errors.push(`Row skipped: Category "${row.categoryName}" not found.`);
        continue;
      }

      const sku = await generateSku(cat.id, cat.skuPrefix);

      const [product] = await db
        .insert(productsTable)
        .values({
          name: row.productName,
          sku,
          categoryId: cat.id,
          price: String(row.unitCost),
          unitOfMeasure: row.unitOfMeasure,
          stock: 0,
        })
        .returning();

      created.push(product);
    }

    res.status(201).json({ created: created.length, errors });
  },
);

// POST /import/count/preview
router.post(
  "/import/count/preview",
  requirePermission("can_batch_upload"),
  async (req, res): Promise<void> => {
    const parsed = ImportCountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const allProducts = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        sku: productsTable.sku,
        stock: productsTable.stock,
      })
      .from(productsTable);

    const skuMap = new Map(allProducts.map((p) => [p.sku.toLowerCase(), p]));

    const preview = parsed.data.rows.map((row, index) => {
      const rowNumber = index + 1;
      const product = skuMap.get(row.sku.toLowerCase());

      if (!product) {
        return {
          rowNumber,
          sku: row.sku,
          productName: "",
          systemBalance: 0,
          physicalCount: row.physicalCount,
          difference: 0,
          status: "error" as const,
          error: `SKU "${row.sku}" not found in the system.`,
        };
      }

      const difference = row.physicalCount - product.stock;

      return {
        rowNumber,
        sku: row.sku,
        productName: product.name,
        systemBalance: product.stock,
        physicalCount: row.physicalCount,
        difference,
        status: difference !== 0 ? ("change" as const) : ("no_change" as const),
      };
    });

    res.json(preview);
  },
);

// POST /import/count/commit
router.post(
  "/import/count/commit",
  requirePermission("can_batch_upload"),
  async (req, res): Promise<void> => {
    const parsed = ImportCountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const allProducts = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        sku: productsTable.sku,
        stock: productsTable.stock,
      })
      .from(productsTable);

    const skuMap = new Map(allProducts.map((p) => [p.sku.toLowerCase(), p]));

    const userId = req.user?.userId ?? null;
    let adjusted = 0;
    const errors: string[] = [];

    for (const row of parsed.data.rows) {
      const product = skuMap.get(row.sku.toLowerCase());
      if (!product) {
        errors.push(`SKU "${row.sku}" not found — skipped.`);
        continue;
      }

      const difference = row.physicalCount - product.stock;
      if (difference === 0) continue;

      const opening = product.stock;
      const closing = row.physicalCount;

      await db
        .update(productsTable)
        .set({ stock: closing })
        .where(eq(productsTable.id, product.id));

      await db.insert(inventoryLogsTable).values({
        productId: product.id,
        userId,
        type: "adjustment",
        quantityChange: difference,
        openingBalance: opening,
        closingBalance: closing,
        notes: `Year-end count adjustment (physical: ${row.physicalCount}, system: ${opening})`,
      });

      adjusted++;
    }

    res.json({ adjusted, errors });
  },
);

export default router;
