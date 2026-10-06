# syntax=docker/dockerfile:1

# One image for the whole app: the API server, which also serves the built web
# app (see artifacts/api-server/src/middlewares/webApp.ts).
#
# pnpm-workspace.yaml drops every native binary except linux-x64 glibc, so this
# has to stay a Debian amd64 image. Alpine (musl) and arm64 builds will fail.
FROM --platform=linux/amd64 node:24-bookworm-slim AS workspace
ENV CI=true
RUN npm install -g pnpm@10.34.6
WORKDIR /app

# Manifests first, so the dependency layers survive source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/depositsafe/package.json artifacts/depositsafe/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/db/package.json lib/db/
COPY lib/stripe/package.json lib/stripe/
COPY scripts/package.json scripts/


FROM workspace AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @workspace/api-server run build

# Vite inlines VITE_* values into the browser bundle at build time. Render passes
# the service's environment variables to the build as build args; elsewhere use
# --build-arg. Only the publishable key is read here, and it is public by design.
# The browser copy defaults to the server's key, so one variable is enough.
ARG CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PROXY_URL
# vite.config.ts insists on PORT and BASE_PATH even for a build; PORT is unused here.
RUN export VITE_CLERK_PUBLISHABLE_KEY="${VITE_CLERK_PUBLISHABLE_KEY:-${CLERK_PUBLISHABLE_KEY:-}}" \
  && if [ -z "$VITE_CLERK_PUBLISHABLE_KEY" ]; then \
       echo "CLERK_PUBLISHABLE_KEY has no value. Set it on the service (Render: Environment) or pass it with --build-arg; sign-in cannot work without it." >&2; \
       exit 1; \
     fi \
  && PORT=8080 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/depositsafe run build


FROM workspace AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

# The server is a single bundle, so the runtime needs only what the bundle cannot
# carry: the Stripe sync package (kept external because it reads its own SQL
# migrations from disk) from the workspace root, and drizzle-kit with the schema
# source from lib/db for the schema push in docker/start.sh.
RUN pnpm install --frozen-lockfile --filter workspace --filter @workspace/db
COPY lib/db lib/db
COPY docker docker
COPY --from=build /app/artifacts/api-server/dist artifacts/api-server/dist
COPY --from=build /app/artifacts/depositsafe/dist/public artifacts/depositsafe/dist/public

ENV NODE_ENV=production \
    PORT=8080 \
    DEPOSITSAFE_WEB_ROOT=/app/artifacts/depositsafe/dist/public
USER node
EXPOSE 8080

# tini forwards SIGTERM to node so deploys and restarts shut down promptly.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "docker/start.sh"]
