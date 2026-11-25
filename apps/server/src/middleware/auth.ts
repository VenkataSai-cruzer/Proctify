// ============================================================
// SecureAssess — JWT Auth Middleware (Teacher only)
// ============================================================

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface TeacherJwtPayload {
  teacherId: string;
  email: string;
  name: string;
}

// Augment Express Request so TypeScript recognises req.teacher downstream
declare global {
  namespace Express {
    interface Request {
      teacher?: TeacherJwtPayload;
    }
  }
}

export type AuthedRequest = Request & { teacher: TeacherJwtPayload };

export function requireTeacher(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: missing bearer token" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Server misconfiguration: JWT_SECRET not set" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as TeacherJwtPayload;
    req.teacher = payload;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized: invalid or expired token" });
  }
}
