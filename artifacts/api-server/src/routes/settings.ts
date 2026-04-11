import { Router, type IRouter } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

const UpdateSettingsBody = z.object({
  appName: z.string().min(1).max(200).optional(),
  sessionTimeoutMinutes: z.number().int().min(1).max(1440).optional(),
});

async function ensureSettings() {
  const existing = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, 1));
  if (existing.length === 0) {
    await db.insert(systemSettingsTable).values({ id: 1 });
  }
  return (await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, 1)))[0];
}

router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const settings = await ensureSettings();
  res.json(settings);
});

router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await ensureSettings();

  const updateData: Record<string, unknown> = {};
  if (parsed.data.appName !== undefined) updateData.appName = parsed.data.appName;
  if (parsed.data.sessionTimeoutMinutes !== undefined) updateData.sessionTimeoutMinutes = parsed.data.sessionTimeoutMinutes;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  const [settings] = await db
    .update(systemSettingsTable)
    .set(updateData)
    .where(eq(systemSettingsTable.id, 1))
    .returning();

  res.json(settings);
});

export default router;
