import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATA_DRIVER: z.enum(["memory", "google-sheets"]).default("memory"),
  SESSION_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().min(8).default("change-this-before-deploy"),
  LINE_CHANNEL_SECRET: z.string().optional(),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_EXTRACTION_MODEL: z.string().default("gpt-4o-mini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GOOGLE_SHEET_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  PUBLIC_TRACE_ENABLED: z.enum(["true", "false"]).default("true")
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(source);
  if (parsed.NODE_ENV === "production") {
    if (parsed.SESSION_SECRET === "development-only-secret-change-me-now") {
      throw new Error("SESSION_SECRET must be changed in production");
    }
    if (parsed.ADMIN_PASSWORD === "change-this-before-deploy") {
      throw new Error("ADMIN_PASSWORD must be changed in production");
    }
  }
  if (parsed.DATA_DRIVER === "google-sheets") {
    for (const key of ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"] as const) {
      if (!parsed[key]) throw new Error(`${key} is required when DATA_DRIVER=google-sheets`);
    }
  }
  return {
    ...parsed,
    isProduction: parsed.NODE_ENV === "production",
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(",").map((item) => item.trim()),
    publicTraceEnabled: parsed.PUBLIC_TRACE_ENABLED === "true"
  };
}
