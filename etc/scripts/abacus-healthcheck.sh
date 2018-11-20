#!/bin/bash
set -e

function show_help {
  cat << EOF
Usage: ${0##*/} [-ha] <plan id>

Get org usage
  -h,-? display this help and exit
EOF
}

# A POSIX variable
OPTIND=1         # Reset in case getopts has been used previously in the shell.

while getopts "h?a" opt; do
    case "$opt" in
      h|\?)
        show_help
        exit 0
        ;;
    esac
done

shift $((OPTIND-1))
[ "$1" = "--" ] && shift

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Reading user id and secret from healthchecker env..."
  CLIENT_ID=$(cf env ${ABACUS_PREFIX}abacus-healthchecker | grep -w CLIENT_ID | awk '{ print $2 }')
  CLIENT_SECRET=$(cf env ${ABACUS_PREFIX}abacus-healthchecker | grep -w CLIENT_SECRET | awk '{ print $2 }')
  echo ""
fi

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Missing CLIENT_ID or CLIENT_SECRET !"
  exit 1
fi

echo "Obtaining API endpoint URL ..."
API=$(cf api | awk '{if (NR == 1) {print $3}}')
echo "Using API URL $API"
echo ""

echo "Getting current domain ..."
DOMAIN=$(cf domains | awk '{if (NR == 3) {print $1}}')
DOMAIN=${DOMAIN/cfapps/cf}
echo "Using domain $DOMAIN"
echo ""
if [ -z "$DOMAIN" ]; then
  echo "No domain found ! Are your logged in CF?"
  exit 1
fi

URL="https://${ABACUS_PREFIX}abacus-healthchecker.$DOMAIN/v1/healthcheck"
URL_INTERNAL="https://${ABACUS_PREFIX}abacus-healthchecker.$DOMAIN/v1/healthcheck/internal"

echo "Getting client-facing health from $URL ..."
echo "curl -iks -u $CLIENT_ID:$CLIENT_SECRET -H \"Content-Type: application/json\" $URL"
OUTPUT=$(curl -ks -u $CLIENT_ID:$CLIENT_SECRET -H "Content-Type: application/json" $URL)
if [[ ! $OUTPUT =~ \{.*\} ]]; then
  echo ""
  echo "No health data! Getting original response:"
  curl -kis -u $CLIENT_ID:$CLIENT_SECRET -H "Content-Type: application/json" $URL | jq .
else
  echo $OUTPUT | jq .
fi

echo "Getting internal health from $URL_INTERNAL ..."
echo "curl -iks -u $CLIENT_ID:$CLIENT_SECRET -H \"Content-Type: application/json\" $URL_INTERNAL"
OUTPUT_INTERNAL=$(curl -ks -u $CLIENT_ID:$CLIENT_SECRET -H "Content-Type: application/json" $URL_INTERNAL)
if [[ ! $OUTPUT_INTERNAL =~ \{.*\} ]]; then
  echo ""
  echo "No health data! Getting original response:"
  curl -kis -u $CLIENT_ID:$CLIENT_SECRET -H "Content-Type: application/json" $URL_INTERNAL | jq .
else
  echo $OUTPUT_INTERNAL | jq .
fi
