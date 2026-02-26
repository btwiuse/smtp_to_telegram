import { loadConfig } from "./config.ts";
import { startSmtp } from "./smtp.ts";

function main() {
  let smtpConfig, telegramConfig;
  try {
    ({ smtpConfig, telegramConfig } = loadConfig());
  } catch (err) {
    console.error(`Configuration error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const server = startSmtp(smtpConfig, telegramConfig);

  function shutdown() {
    console.log("Shutdown signal caught");
    const timer = setTimeout(() => {
      console.error("Graceful shutdown timed out");
      process.exit(1);
    }, 60_000);
    if (timer.unref) timer.unref();

    server.close(() => {
      console.log("Shutdown completed, exiting.");
      process.exit(0);
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGQUIT", shutdown);
}

main();
