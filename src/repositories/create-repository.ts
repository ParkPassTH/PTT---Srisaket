import type { AppConfig } from "../config.js";
import type { Repository } from "./repository.js";
import { GoogleSheetsRepository } from "./google-sheets-repository.js";
import { MemoryRepository } from "./memory-repository.js";

export function createRepository(config: AppConfig): Repository {
  if (config.DATA_DRIVER === "google-sheets") {
    return new GoogleSheetsRepository(config.GOOGLE_SHEET_ID!, config);
  }
  return new MemoryRepository();
}
