import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "../config.js";
import type { SessionUser, UserRole } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";

interface SessionRecord {
  user: SessionUser;
  expiresAt: number;
}

const COOKIE_NAME = "ics_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function constantTimeEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

function parseCookies(header?: string) {
  if (!header) return new Map<string, string>();
  return new Map(
    header.split(";").map((pair) => {
      const [key = "", ...rest] = pair.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
}

export class AuthService {
  private sessions = new Map<string, SessionRecord>();

  constructor(private readonly config: AppConfig) {}

  login(email: string, password: string) {
    if (!constantTimeEqual(email.toLowerCase(), this.config.ADMIN_EMAIL.toLowerCase()) ||
        !constantTimeEqual(password, this.config.ADMIN_PASSWORD)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    const token = randomBytes(32).toString("base64url");
    const user: SessionUser = {
      userId: "admin-local",
      email: this.config.ADMIN_EMAIL,
      displayName: "ผู้ดูแลระบบ",
      roles: ["ADMIN", "REVIEWER", "WAREHOUSE", "AUDITOR"]
    };
    this.sessions.set(token, { user, expiresAt: Date.now() + SESSION_DURATION_MS });
    return { token, user };
  }

  attachCookie(response: Response, token: string) {
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS,
      path: "/"
    });
  }

  clearCookie(response: Response) {
    response.clearCookie(COOKIE_NAME, { path: "/" });
  }

  resolveUser(request: Request) {
    const token = parseCookies(request.headers.cookie).get(COOKIE_NAME);
    if (!token) return undefined;
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessions.delete(token);
      return undefined;
    }
    return session.user;
  }

  requireUser = (request: Request, _response: Response, next: NextFunction) => {
    const user = this.resolveUser(request);
    if (!user) return next(new HttpError(401, "AUTH_REQUIRED", "กรุณาเข้าสู่ระบบอีกครั้ง"));
    request.user = user;
    next();
  };

  requireRole = (...roles: UserRole[]) => (request: Request, _response: Response, next: NextFunction) => {
    const user = request.user;
    if (!user || !roles.some((role) => user.roles.includes(role))) {
      return next(new HttpError(403, "INSUFFICIENT_PERMISSION", "บัญชีนี้ไม่มีสิทธิ์ดำเนินการนี้"));
    }
    next();
  };
}
