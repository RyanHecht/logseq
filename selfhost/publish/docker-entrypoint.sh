#!/bin/sh
# Bridges container environment variables into the Worker's `env` object.
#
# Wrangler does NOT pass the host process environment through to the Worker.
# A Worker's `env` is populated only from `[vars]` in wrangler.toml, from
# `--var` flags, or from a `.dev.vars` file next to the config. Setting
# COGNITO_ISSUER in docker-compose therefore leaves `env.COGNITO_ISSUER`
# undefined inside the Worker, and logseq.common.authorization/verify-jwt
# rejects every request with "iss not found" — a 500 that looks like a bad
# token but is really a missing binding.
#
# `.dev.vars` is used rather than `--var` so values never appear in the
# process argument list.
set -eu

CONFIG_DIR="$(dirname "$0")"
DEV_VARS="${CONFIG_DIR}/.dev.vars"

# Required. Without all three, every authenticated route fails closed, so fail
# at startup with a clear cause instead of serving a broken worker.
REQUIRED="COGNITO_ISSUER COGNITO_CLIENT_ID COGNITO_JWKS_URL"

# Optional. COGNITO_CLIENT_IDS allows additional client ids; the R2_* values are
# only used by the presigned-URL route.
OPTIONAL="COGNITO_CLIENT_IDS R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY"

missing=
for name in $REQUIRED; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || missing="$missing $name"
done

if [ -n "$missing" ]; then
  echo "publish: missing required environment variable(s):$missing" >&2
  echo "publish: set them in the compose stack; the worker cannot verify JWTs without them" >&2
  exit 1
fi

umask 077
: > "$DEV_VARS"

for name in $REQUIRED $OPTIONAL; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || continue
  # .dev.vars is parsed line by line, so an embedded newline would silently
  # truncate the value or inject an unrelated key.
  case $value in
    *"
"*)
      echo "publish: $name contains a newline, which .dev.vars cannot represent" >&2
      exit 1
      ;;
  esac
  printf '%s=%s\n' "$name" "$value" >> "$DEV_VARS"
done

echo "publish: wrote $(wc -l < "$DEV_VARS") worker var(s) to .dev.vars"

exec wrangler dev \
  --ip 0.0.0.0 \
  --port 8787 \
  --persist-to "${WRANGLER_STATE_DIR}" \
  --config "${CONFIG_DIR}/wrangler.toml"
