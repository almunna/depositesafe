#!/bin/sh
# Container start: bring the database schema up to date, then serve.
set -eu

# Render publishes the service's public URL. Stripe and Credas webhooks are
# registered against it, and it is the only trusted checkout return origin, so
# set DEPOSITSAFE_PUBLIC_ORIGIN yourself once a custom domain is in front.
if [ -z "${DEPOSITSAFE_PUBLIC_ORIGIN:-}" ] && [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  export DEPOSITSAFE_PUBLIC_ORIGIN="$RENDER_EXTERNAL_URL"
fi
# Checkout is refused from any other origin, so make the value in use easy to find.
echo "Public origin for checkout and webhooks: ${DEPOSITSAFE_PUBLIC_ORIGIN:-not set}"

# On Replit, Publish applies the schema. Here nothing else does, so it happens
# before the server accepts traffic. If either step fails the container exits,
# the deploy fails its health check and the previous version keeps serving.
(cd lib/db && ./node_modules/.bin/drizzle-kit push --config ./drizzle.config.ts)
node docker/stripe-schema.mjs

exec node --enable-source-maps artifacts/api-server/dist/index.mjs
