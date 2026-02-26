import os from "os";

export interface SmtpConfig {
  smtpListen: string;
  smtpPrimaryHost: string;
  smtpMaxEnvelopeSize: number;
  logLevel: string;
}

export interface TelegramConfig {
  telegramChatIds: string;
  telegramBotToken: string;
  telegramApiPrefix: string;
  telegramApiTimeoutSeconds: number;
  messageTemplate: string;
  forwardedAttachmentMaxSize: number;
  forwardedAttachmentMaxPhotoSize: number;
  forwardedAttachmentRespectErrors: boolean;
  messageLengthToSendAsFile: number;
}

/**
 * Parse a human-readable size string into bytes (SI units, as in docker/go-units).
 * Examples: "512" -> 512, "50m" -> 50000000, "10k" -> 10000
 */
export function parseHumanSize(s: string): number {
  const trimmed = s.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)(?:b?)$/);
  if (!match) {
    throw new Error(`Invalid size string: ${s}`);
  }
  const num = parseFloat(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    "": 1,
    k: 1_000,
    m: 1_000_000,
    g: 1_000_000_000,
    t: 1_000_000_000_000,
  };
  if (!(unit in multipliers)) {
    throw new Error(`Unknown size unit: ${unit}`);
  }
  return Math.floor(num * multipliers[unit]);
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return val;
}

function getEnv(name: string, defaultVal: string): string {
  return process.env[name] ?? defaultVal;
}

export function loadConfig(): { smtpConfig: SmtpConfig; telegramConfig: TelegramConfig } {
  const smtpConfig: SmtpConfig = {
    smtpListen: getEnv("ST_SMTP_LISTEN", "127.0.0.1:2525"),
    smtpPrimaryHost: getEnv("ST_SMTP_PRIMARY_HOST", os.hostname()),
    smtpMaxEnvelopeSize: parseHumanSize(getEnv("ST_SMTP_MAX_ENVELOPE_SIZE", "50m")),
    logLevel: getEnv("ST_LOG_LEVEL", "info"),
  };

  const telegramConfig: TelegramConfig = {
    telegramChatIds: requireEnv("ST_TELEGRAM_CHAT_IDS"),
    telegramBotToken: requireEnv("ST_TELEGRAM_BOT_TOKEN"),
    telegramApiPrefix: getEnv("ST_TELEGRAM_API_PREFIX", "https://api.telegram.org/"),
    telegramApiTimeoutSeconds: parseFloat(getEnv("ST_TELEGRAM_API_TIMEOUT_SECONDS", "30")),
    messageTemplate: getEnv(
      "ST_TELEGRAM_MESSAGE_TEMPLATE",
      "From: {from}\\nTo: {to}\\nSubject: {subject}\\n\\n{body}\\n\\n{attachments_details}"
    ),
    forwardedAttachmentMaxSize: parseHumanSize(
      getEnv("ST_FORWARDED_ATTACHMENT_MAX_SIZE", "10m")
    ),
    forwardedAttachmentMaxPhotoSize: parseHumanSize(
      getEnv("ST_FORWARDED_ATTACHMENT_MAX_PHOTO_SIZE", "10m")
    ),
    forwardedAttachmentRespectErrors:
      getEnv("ST_FORWARDED_ATTACHMENT_RESPECT_ERRORS", "false").toLowerCase() === "true",
    messageLengthToSendAsFile: parseInt(
      getEnv("ST_MESSAGE_LENGTH_TO_SEND_AS_FILE", "4095"),
      10
    ),
  };

  return { smtpConfig, telegramConfig };
}
