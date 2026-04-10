import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/auth";
import { requireAuth } from "../middleware/requireAuth";
import { z } from "zod";

const router: IRouter = Router();

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const SetupBody = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
});

// Check if initial setup is needed
router.get("/auth/setup-status", async (_req, res): Promise<void> => {
  const users = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  res.json({ needsSetup: users.length === 0 });
});

// Initial admin setup — only works when no users exist
router.post("/auth/setup", async (req, res): Promise<void> => {
  const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Setup already complete. Please log in." });
    return;
  }

  const parsed = SetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ username, email, passwordHash, isAdmin: true, permissions: [] })
    .returning();

  const token = signToken({
    userId: user.id,
    username: user.username,
    isAdmin: true,
    permissions: [],
  });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      permissions: [],
    },
  });
});

// Login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username and password are required." });
    return;
  }

  const { username, password } = parsed.data;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const permissions = (user.permissions as string[]) ?? [];
  const token = signToken({
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    permissions,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      permissions,
    },
  });
});

// Get current user
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      isAdmin: usersTable.isAdmin,
      permissions: usersTable.permissions,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  res.json({ ...user, permissions: (user.permissions as string[]) ?? [] });
});

export default router;
