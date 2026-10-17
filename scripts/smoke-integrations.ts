import dotenv from "dotenv";
import { GoogleSheetsRepository } from "../src/repositories/google-sheets-repository.js";

dotenv.config({ path: ".env.local" });
const results: Record<string, string> = {};
const safeMessage = (error: unknown) => error instanceof Error ? error.message.replace(/[A-Za-z0-9_\-]{30,}/g, "[redacted]").slice(0, 240) : "unknown";

try {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!spreadsheetId || !email || !key) throw new Error("Missing Google Sheets variables in .env.local");
  const repo = new GoogleSheetsRepository(spreadsheetId, { GOOGLE_SERVICE_ACCOUNT_EMAIL: email, GOOGLE_PRIVATE_KEY: key });
  await repo.ensureSchema();
  results.googleSheets = "PASS";
} catch (error) { results.googleSheets = `FAIL: ${safeMessage(error)}`; }

try {
  const response = await fetch("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } });
  results.line = response.ok ? "PASS" : `FAIL: HTTP ${response.status}`;
} catch (error) { results.line = `FAIL: ${safeMessage(error)}`; }

try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GEMINI_API_KEY ?? "")}`);
  results.gemini = response.ok ? "PASS" : `FAIL: HTTP ${response.status}`;
} catch (error) { results.gemini = `FAIL: ${safeMessage(error)}`; }

console.log(JSON.stringify(results, null, 2));
if (Object.values(results).some((result) => result.startsWith("FAIL"))) process.exitCode = 1;
