# Self-hosted db-sync Node adapter.
#
# Unlike the agent image, this one builds in-container on purpose: better-sqlite3
# is a native module and must be compiled against the exact runtime it will run
# on. Building it here avoids glibc/ABI mismatches between CI and the image.
#
# Build from the repo root:
#     docker build -f selfhost/db-sync/Dockerfile -t logseq-db-sync .

ARG NODE_VERSION=24

# ── Build ────────────────────────────────────────────────────────────────────
FROM clojure:temurin-21-tools-deps AS build
ARG NODE_VERSION=24

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates python3 build-essential \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
 && apt-get install -y nodejs \
 && corepack enable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

WORKDIR /src/deps/db-sync
# --ignore-workspace: the repo root has a pnpm-workspace.yaml, and deps/db-sync
# is not a member of it. Without this, pnpm resolves upward and node_modules
# does not land here, which breaks the COPY into the runtime stage.
RUN pnpm install --frozen-lockfile --ignore-workspace \
 && test -d node_modules || { \
      echo "ERROR: node_modules not in /src/deps/db-sync after install"; \
      ls -la /src/deps/db-sync; ls -la /src | head -30; exit 1; }
RUN pnpm build:node-adapter \
 && test -f worker/dist/node-adapter.js || { \
      echo "ERROR: node-adapter.js not produced"; ls -la worker/dist || true; exit 1; }

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim

WORKDIR /app
COPY --from=build /src/deps/db-sync/worker/dist/node-adapter.js ./
COPY --from=build /src/deps/db-sync/node_modules ./node_modules

# sqlite index + assets
VOLUME ["/data"]
ENV DB_SYNC_PORT=8787 \
    DB_SYNC_DATA_DIR=/data
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.DB_SYNC_PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "node-adapter.js"]
