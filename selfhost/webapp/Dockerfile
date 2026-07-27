# Web frontend, built from THIS repository.
#
# The root ./Dockerfile does `git clone -b master logseq/logseq` and therefore
# ignores its build context entirely — building it from a fork still produces
# upstream's code. This one builds the checked-out source, so forks and
# unreleased branches produce a matching image.
#
# It also tracks the toolchain the repo actually declares (Java 21 / Node 24),
# rather than the Java 11 base the root Dockerfile still pins.
#
# Build from the repo root:
#     docker build -f selfhost/webapp/Dockerfile -t logseq-webapp .

ARG NODE_VERSION=24

# ── Build ────────────────────────────────────────────────────────────────────
FROM clojure:temurin-21-tools-deps AS builder
ARG NODE_VERSION=24

# Native toolchain for canvas and friends, matching the root Dockerfile.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git build-essential \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
 && apt-get install -y nodejs \
 && corepack enable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /data
COPY . .

# `pnpm release` == gulp:build + cljs:release + webpack-app-build, which emits
# app, db-worker, db-worker-node, and publishing into ./static.
RUN pnpm install --frozen-lockfile --config.network-timeout=240000 \
 && pnpm release \
 && test -f static/index.html || { echo "ERROR: static/index.html not produced"; ls -la static | head -40; exit 1; }

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /data/static /usr/share/nginx/html

# The app uses fragment routing (`rfe/start!` with :use-fragment true), so every
# route is served from / and no SPA history fallback is required.

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
