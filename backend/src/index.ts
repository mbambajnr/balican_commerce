import app from "./app";
import { config } from "./config";
import { ensureIndices } from "./services/elasticsearch";

const start = async () => {
  try {
    await ensureIndices();
  } catch (err) {
    console.warn("ES indices not available — search will be degraded:", (err as Error).message);
  }

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
};

start();
