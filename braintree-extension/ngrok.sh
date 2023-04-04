#!/usr/bin/env bash

# Start NGROK in background
if ! nc -z localhost 4040
then
  echo "⚡️Starting ngrok"
  ngrok http 8080 > /dev/null &
fi

# Wait for ngrok to be available
while ! nc -z localhost 4040; do
  sleep 0.2
done
sleep 0.5

# Get NGROK dynamic URL from its own exposed local API
NGROK_REMOTE_URL="$(curl http://localhost:4040/api/tunnels | sed 's#.*"public_url":"\([^"]*\)".*#\1#g')"

if test -z "${NGROK_REMOTE_URL}"
then
  echo "❌ ERROR: ngrok doesn't seem to return a valid URL (${NGROK_REMOTE_URL})."
  exit 1
fi

NGROK_REMOTE_URL=${NGROK_REMOTE_URL}"/braintree-extension/"
echo "✓ SUCCESS: dynamic url endpoint: ${NGROK_REMOTE_URL}"

# Write CONNECT_SERVICE_URL to .env file
sed -i "s#CONNECT_SERVICE_URL=.*#CONNECT_SERVICE_URL=${NGROK_REMOTE_URL}#g" .env
