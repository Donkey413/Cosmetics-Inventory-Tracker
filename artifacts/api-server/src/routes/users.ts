import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAuth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const router: IRouter = Router();

const CreateUserBody = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  isAdmin: z.boolean().optional().default(false),
  permissions: z.array(z.string()).optional().default([]),
});

const UpdatePermissionsBody = z.object({
  permissions: z.array(z.string()),
  isAdmin: z.boolean().optional(),
});

const UpdateUserBody = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  isAdmin: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
});

function serializeUser(u: {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  permissions: unknown;
  createdAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    isAdmin: u.isAdmin,
    permissions: (u.permissions as string[]) ?? [],
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      isAdmin: usersTable.isAdmin,
      permissions: usersTable.permissions,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.username);

  res.json(users.map(serializeUser));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        username: parsed.data.username,
        email: parsed.data.email,
        passwordHash,
        isAdmin: parsed.data.isAdmin,
        permissions: parsed.data.permissions,
      })
      .returning();

    res.status(201).json(serializeUser(user));
  } catch {
    res.status(400).json({ error: "Username or email already exists." });
  }
});

router.patch("/users/:id/permissions", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID." });
    return;
  }

  const parsed = UpdatePermissionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { permissions: parsed.data.permissions };
  if (parsed.data.isAdmin !== undefined) updateData.isAdmin = parsed.data.isAdmin;

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  res.json(serializeUser(user));
});

router.patch("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID." });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, email, password, isAdmin, permissions } = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (username !== undefined) updateData.username = username;
  if (email !== undefined) updateData.email = email;
  if (isAdmin !== undefined) updateData.isAdmin = isAdmin;
  if (permissions !== undefined) updateData.permissions = permissions;
  if (password !== undefined) updateData.passwordHash = await bcrypt.hash(password, 12);

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  try {
    const [user] = await db
      .update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, id))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    res.json(serializeUser(user));
  } catch {
    res.status(400).json({ error: "Username or email already exists." });
  }
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID." });
    return;
  }

  if (req.user?.userId === id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }

  const [user] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  res.sendStatus(204);
});

export default router;
