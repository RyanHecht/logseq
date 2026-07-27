# Self-hosting Logseq (DB version)

Container images for running Logseq's DB version on your own infrastructure.

Logseq's DB version ships an open-source sync server and a CLI with an agent
bridge, but no published images for either. These Dockerfiles fill that gap.

## Images

| Image | Source | Purpose |
|---|---|---|
| `logseq-webapp` | `selfhost/webapp/Dockerfile` | Static web frontend |
| `logseq-db-sync` | `selfhost/db-sync/Dockerfile` | Self-hosted sync server (`deps/db-sync`) |
| `logseq-agent` | `selfhost/agent/Dockerfile` | CLI + `db-worker-node`, for `logseq agent bridge` |
| `logseq-publish` | `selfhost/publish/Dockerfile` | Publish worker on Wrangler's local runtime |

All four are built and published by
`.github/workflows/build-selfhost-images.yml`.

> **Why not the root `Dockerfile`?** It runs
> `git clone -b master https://github.com/logseq/logseq.git` and discards its
> build context, so it always produces upstream master regardless of which
> repository, fork, or branch invokes it. It also still pins Java 11 while the
> repo declares Java 21. `selfhost/webapp/Dockerfile` builds the checked-out
> source instead.

## Architecture note

The DB version is **not** "host the graph somewhere and connect to it." Every
device keeps a full local SQLite replica, and the sync server is a hub that
relays operations between them.

That means the agent image is a **full replica in its own right** — it isn't a
thin client. You run it because something has to be awake to execute
`logseq agent bridge`, not because the data uniquely lives there.

## Why the two images are built differently

**`logseq-db-sync` builds inside the Dockerfile.** `better-sqlite3` is a native
module and must be compiled against the runtime it will actually run on;
building it in CI and copying it in invites glibc/ABI mismatches.

**`logseq-agent` does not build anything.** Producing its artifacts needs two
toolchains — OCaml/opam for the CLI and Clojure/JVM for `db-worker-node`. CI
already has first-class setup actions for both, so the workflow builds the
artifacts on the runner and the Dockerfile just assembles a slim runtime image.

To build the agent image by hand, produce the artifacts first (the same commands
`deps-cli.yml` uses):

```bash
cd cli && opam install . --deps-only --yes && cd ..
pnpm install --frozen-lockfile
opam exec -- pnpm cli:release        # -> static/logseq-cli.js
pnpm db-worker-node:release:bundle   # -> dist/db-worker-node.js (+ assets)

docker build -f selfhost/agent/Dockerfile -t logseq-agent .
```

> The npm package `@logseq/cli` is **not** a substitute. It points at a
> `deps/cli` directory that no longer exists, is built on the older nbb
> architecture, and ships no `agent bridge`.

## The publish server runs on `workerd`, locally

`deps/publish` is a Cloudflare Worker: page metadata lives in a SQLite-backed
Durable Object, blobs in an R2 bucket. Wrangler runs both **locally** through
`workerd` — no Cloudflare account, no network calls to Cloudflare. This is the
same loop `deps/publish` uses for its own development.

Rewriting it as a plain Node service was considered and rejected: porting ~3,400
lines means re-porting every upstream change forever. Running the runtime it was
written for keeps the upstream source unmodified.

Known limits of the local runtime:

- **Single replica.** Durable Object and R2 state are container-local, so this
  cannot be scaled horizontally.
- **`/pages/:graph/:page/transit` returns a Cloudflare-style presigned R2 URL**
  that will not resolve locally. Rendered pages and assets do not use that
  route; only raw-transit API consumers would notice.
- State lives under the `--persist-to` directory; mount it or published pages
  vanish on recreate.

```bash
docker run -d --name logseq-publish \
  -p 8788:8787 \
  -v /srv/logseq-publish:/data \
  -e COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8 \
  -e COGNITO_CLIENT_ID=69cs1lgme7p8kbgld8n5kseii6 \
  -e COGNITO_JWKS_URL=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8/.well-known/jwks.json \
  ghcr.io/<owner>/logseq-publish:latest
```

Then set **Publish server URL** in the client.

> Never set `DEV_SKIP_AUTH` — it bypasses JWT verification entirely.

## Running the sync server

```bash
docker run -d --name logseq-db-sync \
  -p 8787:8787 \
  -v /srv/logseq-sync:/data \
  -e DB_SYNC_BASE_URL=https://sync.example.com \
  -e COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8 \
  -e COGNITO_CLIENT_ID=69cs1lgme7p8kbgld8n5kseii6 \
  -e COGNITO_JWKS_URL=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8/.well-known/jwks.json \
  ghcr.io/<owner>/logseq-db-sync:latest
```

Then in the app: **Settings → Advanced → Sync server URL** →
`https://sync.example.com` (no `/sync` suffix — the client derives the WebSocket
route itself).

Verify with `curl https://sync.example.com/health` → `{"ok":true}`.

### Things that will bite you

- **Proxy WebSocket upgrades**, not just HTTP. Sync will appear to connect and
  then do nothing if your reverse proxy drops upgrades.
- **Don't put an auth layer in front of the sync endpoint.** Desktop clients
  authenticate with bearer tokens, not browser sessions, so Authelia/Authentik
  style portals break them. The server already validates JWTs on every request.
- **Self-hosting sync does not self-host identity.** Authentication still goes
  through Logseq's Cognito pool; the `COGNITO_*` values above are Logseq's
  production pool, not something you provision.
- **Encrypted graphs disable the semantic API.** `POST /capture`, the REST API,
  and MCP all return `409 semantic-api-unavailable-for-e2ee` on E2EE graphs. If
  you want those, the graph must be created with encryption disabled — a choice
  made at creation time.
- **Never put a live graph SQLite file on Dropbox/iCloud/etc.** File-sync
  services corrupt open databases. Use db-sync for multi-device.

## Environment variables

See `deps/db-sync/README.md` for the full list. The ones that matter most:

| Variable | Purpose |
|---|---|
| `DB_SYNC_PORT` | HTTP port (default 8787) |
| `DB_SYNC_BASE_URL` | External base URL, used for asset links |
| `DB_SYNC_DATA_DIR` | sqlite + assets location — **mount this** |
| `COGNITO_ISSUER` / `COGNITO_CLIENT_ID` / `COGNITO_JWKS_URL` | Token validation |

`DB_SYNC_ALLOW_UNVERIFIED_JWT_CLAIMS` exists but **disables JWT verification**.
It is for local development only; never set it on an exposed server.
