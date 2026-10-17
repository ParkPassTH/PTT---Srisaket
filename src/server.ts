import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createRepository } from "./repositories/create-repository.js";

const config = loadConfig();

const repository = createRepository(config);
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
