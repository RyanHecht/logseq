# Self-hosted publish server, running Cloudflare's open-source `workerd` runtime
# locally through Wrangler.
#
# `deps/publish` is a Cloudflare Worker: page metadata lives in a SQLite-backed
# Durable Object and blobs in an R2 bucket. Wrangler runs both locally with no
# Cloudflare account and no network calls to Cloudflare — this is the same loop
# upstream uses for development (`deps/publish`'s own `pnpm dev`).
#
# Rewriting it as a plain Node service was considered and rejected: it would mean
# porting ~3,400 lines and then re-porting every upstream change forever. Running
# the runtime it was written for keeps `deps/publish` vendor-tracked and unmodified.
#
# Build from the repo root:
#     docker build -f selfhost/publish/Dockerfile -t logseq-publish .

ARG NODE_VERSION=24

# ── Build ────────────────────────────────────────────────────────────────────
FROM clojure:temurin-21-tools-deps AS build
ARG NODE_VERSION=24

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
 && apt-get install -y nodejs \
 && corepack enable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

WORKDIR /src/deps/publish
# Emits worker/dist/worker/main.js, exporting both the worker and the
# PublishMetaDO Durable Object class.
# --ignore-workspace for the same reason as deps/db-sync: deps/publish is not a
# member of the root pnpm workspace, so without it resolution walks upward and
# node_modules never lands here.
RUN pnpm install --frozen-lockfile --ignore-workspace \
 && test -d node_modules || { echo "ERROR: node_modules not in deps/publish"; ls -la; exit 1; }
RUN pnpm release \
 && test -f worker/dist/worker/main.js || { echo "ERROR: worker bundle not produced"; ls -la worker/dist 2>/dev/null; exit 1; }

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
ARG WRANGLER_VERSION=4.114.0

# workerd validates outbound TLS against the system CA store. Node compiles in
# its own CA list, so the sibling Node images work without this, but workerd does
# not — and node:*-slim ships no CA bundle at all. Without this the JWKS fetch in
# verify-jwt fails with "TLS peer's certificate is not trusted" and every
# authenticated request returns 500.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Pinned deliberately: `deps/publish` does not declare wrangler, so `pnpm exec`
# would resolve a floating version at runtime and the worker runtime could change
# under a rebuild.
RUN npm install -g wrangler@${WRANGLER_VERSION} \
 && npm cache clean --force

WORKDIR /app
COPY --from=build /src/deps/publish/worker/dist ./dist
# shadow-cljs builds this target with :js-provider :import, so npm packages stay
# as external imports in the bundle (mldoc, etc). Without node_modules present,
# wrangler fails at startup with: Could not resolve "mldoc".
COPY --from=build /src/deps/publish/node_modules ./node_modules
COPY selfhost/publish/wrangler.toml ./wrangler.toml
# Translates container env vars into worker bindings; see the script header.
COPY selfhost/publish/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Durable Object and R2 state. Persisted here so published pages survive a
# container recreate.
ENV WRANGLER_STATE_DIR=/data
VOLUME ["/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/').then(()=>process.exit(0)).catch(()=>process.exit(1))"

# The entrypoint writes .dev.vars from the environment, then execs wrangler with
# --ip 0.0.0.0 (wrangler binds localhost otherwise) and --persist-to so the
# Durable Object and R2 state land on the mounted volume.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
