#!/bin/bash
set -e

function show_help {
  cat << EOF
Usage: ${0##*/} PATH_TO_USAGE_DOC_FILE

Post usage document to Abacus instance
EOF
}

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Missing CLIENT_ID or CLIENT_SECRET !"
  exit 1
fi

if [ -z "$DOMAIN" ]; then
  echo "Missing DOMAIN !"
  exit 1
fi

if [ -z "$1" ]; then
  echo "No file to usage doc to post specified!"
  show_help
  exit 1
fi
if [ ! -f "$1" ]; then
  echo "Specified usage doc file not found!"
  show_help
  exit 1
fi
PATH_TO_USAGE_DOC_FILE=$1

AUTH_SERVER="https://uaa.cf.$DOMAIN"

echo "Getting token for $CLIENT_ID from $AUTH_SERVER ..."
AUTH_RESPONSE=$(curl -k --user "$CLIENT_ID":"$CLIENT_SECRET" -X POST -s "$AUTH_SERVER/oauth/token?grant_type=client_credentials&scope=$SCOPE")
TOKEN=$(echo "$AUTH_RESPONSE" | jq -r .access_token)
echo ""

URL="https://abacus-usage-collector.cf.$DOMAIN/v1/metering/collected/usage"
echo "Using $URL"
echo ""

echo "Posting usage doc to $URL ..."
set +e
curl -d @${PATH_TO_USAGE_DOC_FILE} -vvv -ks --max-time 300 -H "Authorization: bearer $TOKEN" -H "Content-Type: application/json" $URL
