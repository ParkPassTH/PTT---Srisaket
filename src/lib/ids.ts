import { randomBytes, randomUUID } from "node:crypto";

export function createId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export function createTraceToken() {
  return randomBytes(24).toString("base64url");
}
