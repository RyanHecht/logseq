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
#
# The config exists to stop CDNs and browsers pinning a stale /js/main.js, which
# is not content-hashed and otherwise survives a deploy for hours.
COPY selfhost/webapp/default.conf /etc/nginx/conf.d/default.conf

# Seed per-browser localStorage defaults (sync server URL, theme, telemetry) so
# a new browser or device is usable without manual setup. Deployments mount
# their own /usr/share/nginx/html/web-defaults.json; a placeholder ships so the
# fetch does not 404 when nothing is mounted.
#
# The script also reads an OPTIONAL /web-secrets.json, which is deliberately NOT
# shipped: a 404 is the correct default. Only mount one behind an
# authenticating proxy, since its contents are served to every browser that can
# load the page.
COPY selfhost/webapp/seed-defaults.js /usr/share/nginx/html/seed-defaults.js
RUN sed -i 's#<head>#<head><script src="/seed-defaults.js"></script>#' /usr/share/nginx/html/index.html \
 && grep -q 'seed-defaults.js' /usr/share/nginx/html/index.html \
    || { echo "ERROR: failed to inject seed script into index.html"; exit 1; }

# Mount points for the seed files, served via nginx alias from /config.
# They exist in the image so a read-only container can mount over them, and both
# are optional: an empty directory yields a 404, which the seed script ignores.
RUN mkdir -p /config/defaults /config/secrets

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
