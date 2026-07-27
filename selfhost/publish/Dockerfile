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
RUN pnpm install --frozen-lockfile \
 && pnpm release \
 && test -f worker/dist/worker/main.js || { echo "ERROR: worker bundle not produced"; ls -la worker/dist 2>/dev/null; exit 1; }

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
ARG WRANGLER_VERSION=4.114.0

# Pinned deliberately: `deps/publish` does not declare wrangler, so `pnpm exec`
# would resolve a floating version at runtime and the worker runtime could change
# under a rebuild.
RUN npm install -g wrangler@${WRANGLER_VERSION} \
 && npm cache clean --force

WORKDIR /app
COPY --from=build /src/deps/publish/worker/dist ./dist
COPY selfhost/publish/wrangler.toml ./wrangler.toml

# Durable Object and R2 state. Persisted here so published pages survive a
# container recreate.
ENV WRANGLER_STATE_DIR=/data
VOLUME ["/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/').then(()=>process.exit(0)).catch(()=>process.exit(1))"

# --ip 0.0.0.0 so the container is reachable; wrangler binds localhost otherwise.
# --persist-to keeps DO + R2 state on the mounted volume.
CMD ["sh", "-c", "wrangler dev --ip 0.0.0.0 --port 8787 --persist-to ${WRANGLER_STATE_DIR} --config wrangler.toml"]
