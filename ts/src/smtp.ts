import { SMTPServer } from "smtp-server";
import type { SmtpConfig, TelegramConfig } from "./config.ts";
import { formatEmail } from "./email.ts";
import { sendEmailToTelegram } from "./telegram.ts";

/**
 * Parse "host:port" listen address into { host, port }.
 */
function parseListenAddress(listen: string): { host: string; port: number } {
  const lastColon = listen.lastIndexOf(":");
  if (lastColon === -1) {
    throw new Error(`Invalid listen address (expected host:port): ${listen}`);
  }
  const host = listen.slice(0, lastColon);
  const port = parseInt(listen.slice(lastColon + 1), 10);
  if (isNaN(port)) {
    throw new Error(`Invalid port in listen address: ${listen}`);
  }
  return { host, port };
}

/**
 * Start the SMTP server and return it.
 */
export function startSmtp(
  smtpConfig: SmtpConfig,
  telegramConfig: TelegramConfig
): SMTPServer {
  const { host, port } = parseListenAddress(smtpConfig.smtpListen);

  const server = new SMTPServer({
    // Allow any sender/recipient without authentication
    authOptional: true,
    disabledCommands: ["AUTH"],
    allowInsecureAuth: true,
    // Enforce max message size
    size: smtpConfig.smtpMaxEnvelopeSize,
    // Accept any domain
    onRcptTo(_address, _session, callback) {
      callback();
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];

      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on("end", () => {
        const rawEmail = Buffer.concat(chunks);
        const from =
          session.envelope.mailFrom
            ? (session.envelope.mailFrom as { address: string }).address
            : "";
        const to = (
          session.envelope.rcptTo as Array<{ address: string }>
        )
          .map((r) => r.address)
          .join(", ");

        formatEmail(rawEmail, from, to, telegramConfig)
          .then((formattedEmail) => sendEmailToTelegram(formattedEmail, telegramConfig))
          .then(() => {
            callback();
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (smtpConfig.logLevel !== "error") {
              console.error(`Error processing email: ${msg}`);
            }
            callback(new Error(`421 Error: ${msg}`));
          });
      });

      stream.on("error", (err) => {
        callback(err);
      });
    },
  });

  server.on("error", (err) => {
    console.error(`SMTP server error: ${err.message}`);
  });

  server.listen(port, host, () => {
    console.log(`SMTP server listening on ${host}:${port}`);
  });

  return server;
}
