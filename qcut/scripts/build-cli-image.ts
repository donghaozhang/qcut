#!/usr/bin/env bun
/**
 * Build (and locally smoke-test) the qcut-cli Docker image.
 *
 *   bun run build:cli-image                  # builds qcut-cli:dev
 *   QCUT_VERSION=v0.3.2 bun run build:cli-image
 *   PLATFORMS=linux/amd64,linux/arm64 bun run build:cli-image
 *
 * After build, runs the inside-image smoke (Layer 1 from verification
 * doc). Push to a registry is intentionally NOT done here — CI owns
 * that step.
 *
 * @module scripts/build-cli-image
 */

import { $ } from "bun";

const version = process.env.QCUT_VERSION ?? "dev";
const tag = `qcut-cli:${version}`;
const platforms = process.env.PLATFORMS ?? "linux/amd64";

// `docker buildx --load` materializes the image into the local docker
// engine, but the docker exporter cannot represent manifest lists, so a
// multi-platform input fails with "docker exporter does not currently
// support exporting manifest lists". CI uses `--push` for multi-arch;
// this script is for local smoking.
if (platforms.includes(",")) {
	console.error(
		`✗ PLATFORMS=${platforms} is multi-platform; --load can only carry a single arch.\n  • Local smoke: leave PLATFORMS unset (linux/amd64) or pick one arch.\n  • Multi-arch publish: use the CI workflow that runs --push to a registry.`
	);
	process.exit(2);
}

console.log(`▶ docker buildx build → ${tag} (${platforms})`);
await $`docker buildx build \
  --file Dockerfile.cli \
  --platform ${platforms} \
  --tag ${tag} \
  --build-arg QCUT_VERSION=${version} \
  --load \
  .`;

console.log(`▶ docker run ${tag} qcut-smoke`);
await $`docker run --rm ${tag} qcut-smoke`;

console.log(`✓ ${tag} built + smoked`);
