import { simpleParser, type ParsedMail, type Attachment } from "mailparser";
import { lookup as mimeLookup } from "./mime.ts";
import type { TelegramConfig } from "./config.ts";

export const ATTACHMENT_TYPE_DOCUMENT = 0;
export const ATTACHMENT_TYPE_PHOTO = 1;

const BODY_TRUNCATED = "\n\n[truncated]";

export interface FormattedAttachment {
  filename: string;
  caption: string;
  content: Buffer;
  fileType: number;
}

export interface FormattedEmail {
  text: string;
  attachments: FormattedAttachment[];
}

/**
 * Guess content type: if it's application/octet-stream, try to infer from filename extension.
 */
export function guessContentType(contentType: string, filename: string): string {
  if (contentType !== "application/octet-stream") {
    return contentType;
  }
  const ext = filename.includes(".") ? "." + filename.split(".").pop()! : "";
  const guessed = mimeLookup(ext);
  return guessed || contentType;
}

/**
 * Returns true if the content type represents a photo that Telegram can render inline.
 */
export function fileIsImage(contentType: string): boolean {
  return contentType === "image/jpeg" || contentType === "image/png";
}

/**
 * Format message from template. Returns [fullText, truncatedText].
 * truncatedText is empty string if no truncation is needed.
 */
export function formatMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachmentsDetails: string,
  telegramConfig: TelegramConfig
): [string, string] {
  const applyTemplate = (bodyText: string): string => {
    return telegramConfig.messageTemplate
      .replace(/\\n/g, "\n")
      .replace("{from}", from)
      .replace("{to}", to)
      .replace("{subject}", subject)
      .replace("{body}", bodyText.trim())
      .replace("{attachments_details}", attachmentsDetails)
      .trim();
  };

  const fullMessageText = applyTemplate(body);
  const fullChars = [...fullMessageText];

  if (fullChars.length <= telegramConfig.messageLengthToSendAsFile) {
    return [fullMessageText, ""];
  }

  const emptyMessageText = applyTemplate("." + BODY_TRUNCATED);
  const emptyChars = [...emptyMessageText];

  if (emptyChars.length >= telegramConfig.messageLengthToSendAsFile) {
    // Impossible to truncate properly - just hard-cut
    return [
      fullMessageText,
      [...fullMessageText].slice(0, telegramConfig.messageLengthToSendAsFile).join(""),
    ];
  }

  const maxBodyLength =
    telegramConfig.messageLengthToSendAsFile - emptyChars.length;
  const bodyChars = [...body.trim()];
  const truncatedBody =
    bodyChars.slice(0, maxBodyLength).join("") + BODY_TRUNCATED;
  const truncatedMessageText = applyTemplate(truncatedBody);

  return [fullMessageText, truncatedMessageText];
}

/**
 * Parse and format an email stream into a FormattedEmail.
 */
export async function formatEmail(
  rawEmail: Buffer,
  from: string,
  to: string,
  telegramConfig: TelegramConfig
): Promise<FormattedEmail> {
  const parsed: ParsedMail = await simpleParser(rawEmail);

  // Fall back to raw email content if mailparser couldn't extract a text body
  // (mirrors Go's `if text == "" { text = e.Data.String() }`)
  let text = parsed.text ?? "";
  if (text === "") {
    text = rawEmail.toString("utf8");
  }
  const subject = parsed.subject ?? "";

  const attachmentsDetails: string[] = [];
  const attachments: FormattedAttachment[] = [];

  const processAttachment = (att: Attachment, emoji: string): void => {
    const filename = att.filename ?? att.cid ?? "";
    const content = att.content as Buffer;
    const contentType = guessContentType(att.contentType, filename);
    const size = content.length;

    let action = "discarded";

    if (
      fileIsImage(contentType) &&
      size <= telegramConfig.forwardedAttachmentMaxPhotoSize
    ) {
      action = "sending...";
      attachments.push({
        filename,
        caption: filename,
        content,
        fileType: ATTACHMENT_TYPE_PHOTO,
      });
    } else if (size <= telegramConfig.forwardedAttachmentMaxSize) {
      action = "sending...";
      attachments.push({
        filename,
        caption: filename,
        content,
        fileType: ATTACHMENT_TYPE_DOCUMENT,
      });
    }

    const humanSize = formatBytes(size);
    attachmentsDetails.push(
      `- ${emoji} ${filename} (${contentType}) ${humanSize}, ${action}`
    );
  };

  // Separate inline and attachment parts (mirroring Go enmime's Inlines then Attachments then OtherParts)
  const isInlinePart = (att: Attachment) => att.related || att.contentDisposition === "inline";
  const isAttachmentPart = (att: Attachment) => !att.related && att.contentDisposition === "attachment";
  const isOtherPart = (att: Attachment) => !isInlinePart(att) && !isAttachmentPart(att);

  const inlineParts = parsed.attachments.filter(isInlinePart);
  const attachmentParts = parsed.attachments.filter(isAttachmentPart);
  const otherParts = parsed.attachments.filter(isOtherPart);

  for (const att of inlineParts) {
    processAttachment(att, "🔗");
  }
  for (const att of attachmentParts) {
    processAttachment(att, "📎");
  }
  for (const att of otherParts) {
    const filename = att.filename ?? att.cid ?? "";
    const content = att.content as Buffer;
    const contentType = guessContentType(att.contentType, filename);
    const humanSize = formatBytes(content.length);
    attachmentsDetails.push(
      `- ❔ ${filename} (${contentType}) ${humanSize}, discarded`
    );
  }

  const formattedAttachmentsDetails =
    attachmentsDetails.length > 0
      ? `Attachments:\n${attachmentsDetails.join("\n")}`
      : "";

  const [fullMessageText, truncatedMessageText] = formatMessage(
    from,
    to,
    subject,
    text,
    formattedAttachmentsDetails,
    telegramConfig
  );

  if (!truncatedMessageText) {
    return { text: fullMessageText, attachments };
  }

  if (fullMessageText.length > telegramConfig.forwardedAttachmentMaxSize) {
    throw new Error(
      `The message length (${fullMessageText.length}) is larger than forwarded-attachment-max-size (${telegramConfig.forwardedAttachmentMaxSize})`
    );
  }

  const fullMessageAttachment: FormattedAttachment = {
    filename: "full_message.txt",
    caption: "Full message",
    content: Buffer.from(fullMessageText),
    fileType: ATTACHMENT_TYPE_DOCUMENT,
  };

  return {
    text: truncatedMessageText,
    attachments: [fullMessageAttachment, ...attachments],
  };
}

/**
 * Format bytes in human-readable form (SI units, matching docker/go-units HumanSize).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes}B`;
  const units = ["kB", "MB", "GB", "TB"];
  let val = bytes;
  let unit = "";
  for (const u of units) {
    val /= 1000;
    unit = u;
    if (val < 1000) break;
  }
  // Match go-units format: up to 4 significant digits
  const formatted = parseFloat(val.toPrecision(4));
  return `${formatted} ${unit}`;
}
