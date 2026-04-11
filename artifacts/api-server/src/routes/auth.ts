import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db, usersTable, systemSettingsTable } from "@workspace/db";
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

async function getSessionTimeoutMinutes(): Promise<number> {
  const [settings] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, 1));
  return settings?.sessionTimeoutMinutes ?? 5;
}

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin1234";

// Check if initial setup is needed — auto-seeds default admin if no users exist
router.get("/auth/setup-status", async (_req, res): Promise<void> => {
  const users = await db.select({ id: usersTable.id }).from(usersTable).limit(1);

  if (users.length === 0) {
    // Auto-create default admin so the app is usable immediately
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
    await db.insert(usersTable).values({
      username: DEFAULT_ADMIN_USERNAME,
      email: "admin@vela.local",
      passwordHash,
      isAdmin: true,
      permissions: [],
    });
  }

  res.json({ needsSetup: false });
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
  const sessionToken = randomUUID();

  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      email,
      passwordHash,
      isAdmin: true,
      permissions: [],
      currentSessionToken: sessionToken,
      lastActiveAt: new Date(),
    })
    .returning();

  const token = signToken({
    userId: user.id,
    username: user.username,
    isAdmin: true,
    permissions: [],
    sessionToken,
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

  // Check if account is currently in active use
  if (user.lastActiveAt && user.currentSessionToken) {
    const timeoutMs = (await getSessionTimeoutMinutes()) * 60 * 1000;
    const msSinceActive = Date.now() - new Date(user.lastActiveAt).getTime();
    if (msSinceActive < timeoutMs) {
      res.status(403).json({ error: "Account is currently in use. Please wait or ask an Admin to kick the active session." });
      return;
    }
  }

  const sessionToken = randomUUID();
  const permissions = (user.permissions as string[]) ?? [];

  await db
    .update(usersTable)
    .set({ currentSessionToken: sessionToken, lastActiveAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const token = signToken({
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    permissions,
    sessionToken,
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

// Heartbeat — keeps the session alive
router.post("/auth/heartbeat", requireAuth, async (req, res): Promise<void> => {
  await db
    .update(usersTable)
    .set({ lastActiveAt: new Date() })
    .where(eq(usersTable.id, req.user!.userId));

  res.json({ ok: true });
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
