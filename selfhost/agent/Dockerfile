# Runtime image for the Logseq CLI + agent bridge.
#
# Deliberately does NOT build anything. The toolchain needed to produce these
# artifacts (OCaml/opam for the CLI, Clojure/JVM for db-worker-node) is heavy and
# is far better handled by CI, which already has setup-ocaml and setup-java.
#
# Build the artifacts first — the same commands CI uses in deps-cli.yml:
#
#     cd cli && opam install . --deps-only --yes && cd ..
#     pnpm install --frozen-lockfile
#     opam exec -- pnpm cli:release          # -> static/logseq-cli.js
#     pnpm db-worker-node:release:bundle     # -> dist/db-worker-node.js (+ assets)
#
# ...then build this image from the repo root:
#
#     docker build -f selfhost/agent/Dockerfile -t logseq-agent .
#
# See .github/workflows/build-selfhost-images.yml for the automated path.

FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/logseq

# The CLI locates db-worker-node by probing several paths relative to its own
# directory (cli/lib/server_runtime.ml). Co-locating them satisfies that lookup.
#
# Copy the whole dist/ directory, not just the bundle: db-worker-node ships an
# asset manifest plus native modules alongside it.
COPY static/logseq-cli.js ./logseq-cli.js
COPY dist/ ./

RUN printf '#!/bin/sh\nexec node /opt/logseq/logseq-cli.js "$@"\n' > /usr/local/bin/logseq \
 && chmod +x /usr/local/bin/logseq

# Copilot CLI — what the agent bridge dispatches tasks to.
RUN npm install -g @github/copilot

# `logseq login` runs a browser OAuth flow: it shells out to xdg-open on Linux
# and waits for a callback on fixed port 8765. A container has no browser, and
# the CLI does not print the authorize URL, so login would hang with nothing to
# act on.
#
# This shim makes xdg-open print the URL instead. Publish port 8765 and open the
# printed URL in any browser that can reach it:
#
#   docker run --rm -it -p 8765:8765 -v ./auth:/root/logseq <image> login
RUN printf '#!/bin/sh\necho\necho "Open this URL to continue login:"\necho "$1"\necho\n' > /usr/local/bin/xdg-open \
 && chmod +x /usr/local/bin/xdg-open

EXPOSE 8765

ENV LOGSEQ_CLI_ROOT_DIR=/graph
WORKDIR /graph
VOLUME ["/graph"]

RUN logseq --help > /dev/null || (echo "CLI smoke test failed" && exit 1)

ENTRYPOINT ["logseq"]
CMD ["--help"]
