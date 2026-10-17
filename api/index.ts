import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createRepository } from "../src/repositories/create-repository.js";
import express, { type Application } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

function describeStartupError(error: unknown) {
  if (error instanceof z.ZodError) {
    const fields = [...new Set(error.issues.map((issue) => issue.path.join(".")).filter(Boolean))];
    return `Environment configuration invalid: ${fields.join(", ")}`;
  }
  if (error instanceof Error && [
    "SESSION_SECRET must be changed in production",
    "ADMIN_PASSWORD must be changed in production",
    "GOOGLE_SHEET_ID is required when DATA_DRIVER=google-sheets",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL is required when DATA_DRIVER=google-sheets",
    "GOOGLE_PRIVATE_KEY is required when DATA_DRIVER=google-sheets"
  ].includes(error.message)) return error.message;
  return "Application startup failed. Check Vercel Function logs.";
}

let app: Application;

try {
  const config = loadConfig();
  app = createApp({ config, repository: createRepository(config) });
} catch (error) {
  const message = describeStartupError(error);
  console.error(JSON.stringify({ level: "error", code: "STARTUP_CONFIGURATION_ERROR", message }));
  app = express();
  app.use((_request, response) => {
    response.status(503).json({
      status: "configuration_error",
      code: "STARTUP_CONFIGURATION_ERROR",
      message
    });
  });
}

export default function handler(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = new URL(request.url ?? "/", "https://internal.vercel");
  const originalPath = requestUrl.searchParams.get("__path");
  if (originalPath) {
    requestUrl.searchParams.delete("__path");
    const query = requestUrl.searchParams.toString();
    request.url = `${originalPath}${query ? `?${query}` : ""}`;
  }
  return app(request, response);
}
