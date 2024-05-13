#!/usr/bin/env bash

# Start NGROK in background
if ! nc -z localhost 4040
then
  echo "⚡️Starting ngrok"
  ./node_modules/.bin/ngrok http 8080 > /dev/null &
fi

# Wait for ngrok to be available
while ! nc -z localhost 4040; do
  sleep 0.2
done
sleep 0.5

# Get NGROK dynamic URL from its own exposed local API
NGROK_REMOTE_URL="$(curl http://localhost:4040/api/tunnels | sed 's#.*"public_url":"\([^"]*\)".*#\1#g')"

if ! [[ "${NGROK_REMOTE_URL}" = http* ]]
then
  echo "❌ ERROR: ngrok doesn't seem to return a valid URL (${NGROK_REMOTE_URL})."
  exit 1
fi

NGROK_REMOTE_URL=${NGROK_REMOTE_URL}"/braintree-extension/"
echo "✓ SUCCESS: dynamic url endpoint: ${NGROK_REMOTE_URL}"

# Write CONNECT_SERVICE_URL to .env file
sed -i.bak "s#CONNECT_SERVICE_URL=.*#CONNECT_SERVICE_URL=${NGROK_REMOTE_URL}#g" .env
rm .env.bak
