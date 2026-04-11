import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (async () => {
    try {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);

      // Stateful session check: verify the session token in the JWT matches the DB
      const [user] = await db
        .select({ currentSessionToken: usersTable.currentSessionToken })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId));

      if (!user || !payload.sessionToken || user.currentSessionToken !== payload.sessionToken) {
        res.status(401).json({ error: "Session expired or logged in from another device." });
        return;
      }

      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  })();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      res.status(403).json({ error: "Forbidden: Admin access required" });
      return;
    }
    next();
  });
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (req.user?.isAdmin || req.user?.permissions.includes(permission)) {
        next();
      } else {
        res.status(403).json({ error: `Forbidden: ${permission} permission required` });
      }
    });
  };
}
