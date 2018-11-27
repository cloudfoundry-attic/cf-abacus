#!/bin/bash
set -e

if [ -z "$SYSTEM_CLIENT_ID" ] || [ -z "$SYSTEM_CLIENT_SECRET" ]; then
  echo "Reading system user id and secret ..."
  cf target -o "${ABACUS_PREFIX}${CF_ORG}" -s "${CF_SPACE}"
  SYSTEM_CLIENT_ID=$(cf env ${ABACUS_PREFIX}abacus-usage-collector | grep -w CLIENT_ID | awk '{ print $2 }')
  SYSTEM_CLIENT_SECRET=$(cf env ${ABACUS_PREFIX}abacus-usage-collector | grep -w CLIENT_SECRET | awk '{ print $2 }')
  echo ""
fi

echo "Obtaining API endpoint URL ..."
API=$(cf api | awk '{if (NR == 1) {print $3}}')
AUTH_SERVER=${API/api./uaa.}
echo "Using API URL $API"
echo ""

echo "Getting token for $SYSTEM_CLIENT_ID from $AUTH_SERVER ..."
TOKEN=$(curl -k --user $SYSTEM_CLIENT_ID:$SYSTEM_CLIENT_SECRET -s "$AUTH_SERVER/oauth/token?grant_type=client_credentials" | jq -r .access_token)
if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "No token found ! Are your credentials correct (SYSTEM_CLIENT_ID and SYSTEM_CLIENT_SECRET)?"
  exit 1
fi
echo "Token obtained"
echo ""

echo "Getting abacus-services-bridge URL ..."
URL=$(cf app ${ABACUS_PREFIX}abacus-services-bridge | awk '{if (NR == 5) {print $2}}')

if [ -z "$URL" ]; then
  echo "Cannot find URL! Have you targeted abacus org/space?"
  exit 1
fi
URL="https://$URL/v1/stats"
echo "Using $URL"
echo ""

echo "Getting statistics ..."
echo ">>> curl -ksH 'Authorization: bearer $TOKEN' $URL"
set +e
OUTPUT=$(curl -ksH "Authorization: bearer $TOKEN" $URL | jq 'del(.performance)')
set -e
if [[ "$OUTPUT" == *"parse error"* ]] || [[ "$OUTPUT" == *"jq: error"* ]] || [[ -z "$OUTPUT" ]]; then
  echo ""
  echo "Dumping raw response ..."
  curl -k -i -H "Authorization: bearer $TOKEN" $URL
else
  echo $OUTPUT | jq .
fi
