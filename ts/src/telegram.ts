import { Bot, InputFile } from "grammy";
import type { TelegramConfig } from "./config.ts";
import {
  ATTACHMENT_TYPE_DOCUMENT,
  ATTACHMENT_TYPE_PHOTO,
  type FormattedAttachment,
  type FormattedEmail,
} from "./email.ts";

export function sanitizeBotToken(s: string, botToken: string): string {
  return s.split(botToken).join("***");
}

/**
 * Create a grammy Bot instance configured with the given TelegramConfig.
 */
function createBot(telegramConfig: TelegramConfig): Bot {
  const apiRoot = telegramConfig.telegramApiPrefix.replace(/\/$/, "");
  return new Bot(telegramConfig.telegramBotToken, {
    client: {
      apiRoot,
      timeoutSeconds: telegramConfig.telegramApiTimeoutSeconds,
    },
  });
}

/**
 * Send a formatted email to all configured Telegram chats.
 */
export async function sendEmailToTelegram(
  message: FormattedEmail,
  telegramConfig: TelegramConfig
): Promise<void> {
  const bot = createBot(telegramConfig);

  const chatIds = telegramConfig.telegramChatIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  for (const chatId of chatIds) {
    let sentMessageId: number;
    try {
      const sent = await bot.api.sendMessage(chatId, message.text, {
        link_preview_options: { is_disabled: true },
      });
      sentMessageId = sent.message_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(sanitizeBotToken(msg, telegramConfig.telegramBotToken));
    }

    for (const attachment of message.attachments) {
      try {
        await sendAttachment(bot, chatId, attachment, sentMessageId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const sanitized = sanitizeBotToken(msg, telegramConfig.telegramBotToken);
        if (telegramConfig.forwardedAttachmentRespectErrors) {
          throw new Error(sanitized);
        } else {
          console.error(`Ignoring attachment sending error: ${sanitized}`);
        }
      }
    }
  }
}

async function sendAttachment(
  bot: Bot,
  chatId: string,
  attachment: FormattedAttachment,
  replyToMessageId: number
): Promise<void> {
  const replyParams = { message_id: replyToMessageId };
  const file = new InputFile(attachment.content, attachment.filename);

  if (attachment.fileType === ATTACHMENT_TYPE_DOCUMENT) {
    await bot.api.sendDocument(chatId, file, {
      caption: attachment.caption,
      disable_notification: true,
      reply_parameters: replyParams,
    });
  } else if (attachment.fileType === ATTACHMENT_TYPE_PHOTO) {
    await bot.api.sendPhoto(chatId, file, {
      caption: attachment.caption,
      disable_notification: true,
      reply_parameters: replyParams,
    });
  } else {
    throw new Error(`Unknown attachment file type: ${attachment.fileType}`);
  }
}
