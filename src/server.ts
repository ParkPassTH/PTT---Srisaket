import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MemoryRepository } from "./repositories/memory-repository.js";

const config = loadConfig();

if (config.DATA_DRIVER !== "memory") {
  throw new Error("Google Sheets adapter is not wired yet. Use DATA_DRIVER=memory during foundation milestone.");
}

const repository = new MemoryRepository();
const app = createApp({ config, repository });

app.listen(config.PORT, () => {
  console.log(JSON.stringify({
    level: "info",
    message: "Voice ICS server started",
    port: config.PORT,
    environment: config.NODE_ENV,
    dataDriver: config.DATA_DRIVER
  }));
});
