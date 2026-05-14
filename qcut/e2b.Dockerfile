# Single-stage variant of Dockerfile.cli for E2B's template builder.
# E2B parser rejects multi-stage `FROM ... AS builder` (see error in
# their js-sdk dockerfileParser.ts). Keep this file in sync with
# Dockerfile.cli by hand for now — small surface, low drift risk.
#
# Build via:
#   E2B_API_KEY=... E2B_ACCESS_TOKEN=... \
#     e2b template create qcut-cli -d e2b.Dockerfile \
#     --cpu-count 2 --memory-mb 4096

FROM oven/bun:1.3.14-debian
ARG QCUT_VERSION=dev
ENV QCUT_VERSION=${QCUT_VERSION}

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
      jq \
 && rm -rf /var/lib/apt/lists/*

# Note: we used to add a `qcut` user here, but E2B's command runner
# always exec's as their internal `user` user — adding our own and
# `USER qcut` breaks `Sandbox.commands.run` with permission-denied on
# /bin/sh. Letting E2B handle the user, keeping everything in /opt and
# /usr/local where any user can read.

WORKDIR /opt/qcut

# Separate COPY per source — E2B's Dockerfile parser only honours the
# first arg in a multi-source COPY.
COPY package.json ./
COPY bun.lock ./
COPY turbo.json ./
COPY tsconfig.json ./
COPY apps apps
COPY packages packages
COPY electron electron
COPY scripts scripts

# Skip postinstall scripts (they run setup-ffmpeg + patch-node-pty
# which assume native arch + Mac context; the container already has
# ffmpeg from apt and doesn't need node-pty). Also skip `bun run build`
# — the CLI wrapper invokes `bun electron/.../cli.ts` directly from
# source, so there's nothing to pre-compile. The apps/web build is
# heavy (OOM-killed `tsc` with 4 GB) and irrelevant for the CLI.
RUN bun install --frozen-lockfile --ignore-scripts \
 && chmod -R a+rX /opt/qcut

# Wrapper + smoke scripts at /usr/local/bin
COPY --chmod=0755 \
     electron/native-pipeline/container/entrypoint.sh \
     /usr/local/bin/qcut-entrypoint
COPY --chmod=0755 \
     electron/native-pipeline/container/smoke.sh \
     /usr/local/bin/qcut-smoke

# Friendly `qcut` invocation, system-wide so any user can run it.
# Using two `echo` lines instead of `printf '%s\n' ... ...` because
# E2B's Dockerfile parser mishandles the `\n` escape (leaves literal
# `n` in the output file, breaking the shebang).
RUN echo '#!/usr/bin/env bash' > /usr/local/bin/qcut \
 && echo 'exec bun /opt/qcut/electron/native-pipeline/cli/cli.ts "$@"' >> /usr/local/bin/qcut \
 && chmod 0755 /usr/local/bin/qcut

# E2B honors ENTRYPOINT + CMD for template start. The Spawn API can
# override per-session via the SDK.
ENTRYPOINT ["/usr/local/bin/qcut-entrypoint"]
CMD ["bash"]
