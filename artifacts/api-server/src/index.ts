import httpServer from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || 5001;

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening (WebSockets enabled)");
});
