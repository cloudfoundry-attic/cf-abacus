#!/bin/bash
set -e

function show_help {
  cat << EOF
Usage: ${0##*/} <organization id>

Get org usage
EOF
}

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Missing CLIENT_ID or CLIENT_SECRET !"
  exit 1
fi

if [ -z "$1" ]; then
  echo "No organization id specified !"
  show_help
  exit 1
fi
ORG_GUID=$1

AUTH_SERVER="https://uaa.cf.$DOMAIN"
SCOPE="abacus.usage.read"

if [ "$CLIENT_ID" != "abacus" ] && [ -n "$RESOURCE_ID" ]; then
  SCOPE="abacus.usage.$RESOURCE_ID.read"
else 
  echo "Missing RESOURCE_ID !"
  exit 1
fi

echo "Getting token for $CLIENT_ID from $AUTH_SERVER ..."
AUTH_RESPONSE=$(curl -k --user "$CLIENT_ID":"$CLIENT_SECRET" -s "$AUTH_SERVER/oauth/token?grant_type=client_credentials&scope=$SCOPE") 
TOKEN=$(echo "$AUTH_RESPONSE" | jq -r .access_token)
if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo ""
  echo "No token found ! Output: $AUTH_RESPONSE" 
  echo "Are your credentials correct (CLIENT_ID, CLIENT_SECRET and RESOURCE_ID)?"
  exit 1
fi
echo "Obtained token $TOKEN"
echo ""

URL="https://abacus-usage-reporting.cf.$DOMAIN/v1/metering/organizations/${ORG_GUID}/aggregated/usage"
echo "Using $URL"
echo ""

echo "Getting report for org ($ORG_GUID) from $URL ..."
set +e
curl -ks --max-time 300 -H "Authorization: bearer $TOKEN" -H "Content-Type: application/json" $URL | jq .