import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MemoryRepository } from "../src/repositories/memory-repository.js";

const config = loadConfig();

if (config.DATA_DRIVER !== "memory") {
  throw new Error("Google Sheets adapter is not wired yet. Use DATA_DRIVER=memory for the current Vercel preview.");
}

// This repository survives only while the serverless instance stays warm.
// Gate A will replace it with persistent Google Sheets storage.
const app = createApp({ config, repository: new MemoryRepository() });

export default app;
