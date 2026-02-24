# Architecture

The following diagram describes the high-level architecture of `smtp_to_telegram`.

```mermaid
flowchart TD
    Sender["📧 Email Sender\n(any SMTP client)"]
    SMTP["SMTP Server\n(go-guerrilla)\nlistens on :2525"]
    Pipeline["Processing Pipeline\nHeadersParser → Header → Hasher → TelegramBot"]
    Parser["Email Parser\n(enmime)\nExtracts text, attachments"]
    Formatter["Message Formatter\nApplies message template\n{from}, {to}, {subject}, {body}, {attachments_details}"]
    TelegramAPI["Telegram Bot API\nhttps://api.telegram.org/"]
    Chat1["💬 Telegram Chat 1"]
    Chat2["💬 Telegram Chat 2"]
    ChatN["💬 Telegram Chat N"]

    Sender -->|"SMTP (no TLS/auth)"| SMTP
    SMTP --> Pipeline
    Pipeline --> Parser
    Parser --> Formatter
    Formatter -->|"sendMessage"| TelegramAPI
    Formatter -->|"sendDocument / sendPhoto\n(attachments as replies)"| TelegramAPI
    TelegramAPI --> Chat1
    TelegramAPI --> Chat2
    TelegramAPI --> ChatN
```

## Components

| Component | Description |
|---|---|
| **SMTP Server** | Listens for incoming emails (default `127.0.0.1:2525`). Implemented with [go-guerrilla](https://github.com/flashmob/go-guerrilla). No TLS or authentication required. |
| **Processing Pipeline** | go-guerrilla backend pipeline: `HeadersParser`, `Header`, `Hasher`, then the custom `TelegramBot` processor. |
| **Email Parser** | Uses [enmime](https://github.com/jhillyerd/enmime) to decode MIME messages and extract plain-text body, inline parts, and file attachments. |
| **Message Formatter** | Renders the configurable message template (`ST_TELEGRAM_MESSAGE_TEMPLATE`) with email fields. Long messages are truncated and the full text is sent as an attached file. |
| **Telegram Bot API** | The formatted message is delivered to every configured chat ID (`ST_TELEGRAM_CHAT_IDS`) via the [Telegram Bot API](https://core.telegram.org/bots/api). Images are sent with `sendPhoto`; other files with `sendDocument`, both as replies to the text message. |
