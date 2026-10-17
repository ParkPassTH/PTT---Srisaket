import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { AppConfig } from "../config.js";
import type { SessionUser, UserRole } from "../domain/types.js";
import { HttpError } from "../lib/http-error.js";

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
  constructor(private readonly config: AppConfig) {}

  private sign(payload: string) {
    return createHmac("sha256", this.config.SESSION_SECRET).update(payload).digest("base64url");
  }

  login(email: string, password: string) {
    if (!constantTimeEqual(email.toLowerCase(), this.config.ADMIN_EMAIL.toLowerCase()) ||
        !constantTimeEqual(password, this.config.ADMIN_PASSWORD)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    const user: SessionUser = {
      userId: "admin-local",
      email: this.config.ADMIN_EMAIL,
      displayName: "ผู้ดูแลระบบ",
      roles: ["ADMIN", "REVIEWER", "WAREHOUSE", "AUDITOR"]
    };
    const payload = Buffer.from(JSON.stringify({ user, expiresAt:Date.now() + SESSION_DURATION_MS })).toString("base64url");
    const token = `${payload}.${this.sign(payload)}`;
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
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !constantTimeEqual(signature, this.sign(payload))) return undefined;
    try {
      const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user:SessionUser; expiresAt:number };
      if (session.expiresAt <= Date.now()) return undefined;
      return session.user;
    } catch { return undefined; }
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
