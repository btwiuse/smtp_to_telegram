#!/bin/sh
# Send a text message to a Telegram chat.
# Usage: tg_send_message.sh BOT_TOKEN API_URL_PREFIX CHAT_ID TIMEOUT_SECONDS
# The message text is read from stdin.
# Outputs the JSON API response on stdout on success.
# Exits with a non-zero status on failure.
set -e

BOT_TOKEN="$1"
API_PREFIX="$2"
CHAT_ID="$3"
TIMEOUT="${4:-30}"

RESPONSE=$(curl -s --max-time "$TIMEOUT" \
    -X POST "${API_PREFIX%/}/bot${BOT_TOKEN}/sendMessage" \
    -F "chat_id=${CHAT_ID}" \
    -F "text=<-" \
    -F 'link_preview_options={"is_disabled":true}')

if ! printf '%s' "$RESPONSE" | grep -q '"ok":true'; then
    printf 'Telegram API error: %s\n' "$RESPONSE" >&2
    exit 1
fi

printf '%s' "$RESPONSE"
