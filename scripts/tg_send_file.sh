#!/bin/sh
# Send a document or photo to a Telegram chat as a reply.
# Usage: tg_send_file.sh BOT_TOKEN API_URL_PREFIX CHAT_ID TYPE FILE_PATH FILENAME CAPTION REPLY_MESSAGE_ID TIMEOUT_SECONDS
# TYPE is "document" or "photo".
# Exits with a non-zero status on failure.
set -e

BOT_TOKEN="$1"
API_PREFIX="$2"
CHAT_ID="$3"
TYPE="$4"
FILE_PATH="$5"
FILENAME="$6"
CAPTION="$7"
REPLY_MSG_ID="$8"
TIMEOUT="${9:-30}"

case "$TYPE" in
    document) ENDPOINT="sendDocument" ;;
    photo)    ENDPOINT="sendPhoto" ;;
    *) printf 'Unknown file type: %s\n' "$TYPE" >&2; exit 1 ;;
esac

RESPONSE=$(curl -s --max-time "$TIMEOUT" \
    -X POST "${API_PREFIX%/}/bot${BOT_TOKEN}/${ENDPOINT}" \
    -F "chat_id=${CHAT_ID}" \
    -F "${TYPE}=@${FILE_PATH};filename=${FILENAME}" \
    -F "caption=${CAPTION}" \
    -F "disable_notification=true" \
    -F "reply_parameters={\"message_id\":${REPLY_MSG_ID}}")

if ! printf '%s' "$RESPONSE" | grep -q '"ok":true'; then
    printf 'Telegram API error: %s\n' "$RESPONSE" >&2
    exit 1
fi
