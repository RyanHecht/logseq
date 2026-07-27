#!/bin/sh
# Assembles the localStorage seed files into a single writable directory before
# nginx starts.
#
# Two sources, so a deployment can use whichever fits how it manages secrets:
#
#   env var       LOGSEQ_REFRESH_TOKEN  - for stack.env / Portainer-style config
#   mounted file  /config/secrets/...   - for secrets kept off the container env
#
# The env var wins when both are present. Neither is required: with no source,
# no file is written, nginx returns 404, and the seed script treats that as
# nothing to seed.
#
# Output goes to /tmp/seed because the container runs read-only, and /tmp is
# tmpfs. Nothing here is persisted, which is intentional - it is regenerated
# from configuration on every start.

set -eu

SEED_DIR=/tmp/seed
mkdir -p "$SEED_DIR"

# Non-secret defaults: sync URL, theme, and similar.
if [ -f /config/defaults/web-defaults.json ]; then
  cp /config/defaults/web-defaults.json "$SEED_DIR/web-defaults.json"
fi

# Secrets. A refresh token is base64url plus dots, so it needs no JSON escaping,
# but reject anything containing a quote or backslash rather than emit broken
# JSON that would fail silently in the browser.
if [ -n "${LOGSEQ_REFRESH_TOKEN:-}" ]; then
  case "$LOGSEQ_REFRESH_TOKEN" in
    *\"*|*\\*)
      echo "seed: LOGSEQ_REFRESH_TOKEN contains a quote or backslash; ignoring" >&2
      ;;
    *)
      printf '{"raw":{"refresh-token":"%s"}}\n' "$LOGSEQ_REFRESH_TOKEN" \
        > "$SEED_DIR/web-secrets.json"
      echo "seed: web-secrets.json written from LOGSEQ_REFRESH_TOKEN"
      ;;
  esac
elif [ -f /config/secrets/web-secrets.json ]; then
  cp /config/secrets/web-secrets.json "$SEED_DIR/web-secrets.json"
  echo "seed: web-secrets.json taken from mounted file"
fi

chmod 644 "$SEED_DIR"/*.json 2>/dev/null || true
