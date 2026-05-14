#!/usr/bin/env bun
/**
 * End-to-end dogfood: spin up a Daytona sandbox from `qcut-cli`, run
 * one real pipeline, pull the artifact back, tear the sandbox down.
 *
 * Pre-reqs: `daytona` CLI installed, `daytona login` done, an image
 * tag pushed to the configured registry.
 *
 *   bun run scripts/daytona-dogfood.ts
 *   QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:v0.1.0 \
 *     bun run scripts/daytona-dogfood.ts
 *
 * Exits non-zero on any step failure.
 */

import { $ } from "bun";
import { randomUUID } from "node:crypto";

const SANDBOX = `qcut-dogfood-${randomUUID().slice(0, 8)}`;
const IMAGE =
	process.env.QCUT_IMAGE_TAG ?? "ghcr.io/quriosity-agent/qcut-cli:v0";

console.log(`▶ daytona create ${SANDBOX}  (image ${IMAGE})`);
await $`daytona create ${SANDBOX} --image ${IMAGE} --quiet`;

try {
	console.log("▶ doctor inside sandbox");
	const doctor =
		await $`daytona ssh ${SANDBOX} -- qcut system doctor --json --skip-health`.text();
	console.log(doctor);

	console.log("▶ idea2video --dry-run (validates routing)");
	const dry =
		await $`daytona ssh ${SANDBOX} -- qcut flow idea2video --input "a red panda eating bamboo" --skip-health --no-confirm --dry-run --json`.text();
	console.log(dry);

	console.log("▶ idea2video real (1s clip)");
	await $`daytona ssh ${SANDBOX} -- qcut flow idea2video --input "a red panda eating bamboo" --duration 1 --skip-health --no-confirm --stream --json -o /tmp/out`;

	const local = `./dogfood-${SANDBOX}.mp4`;
	await $`daytona scp ${SANDBOX}:/tmp/out/final.mp4 ${local}`;
	console.log(`✓ artifact saved to ${local}`);
} finally {
	console.log(`▶ daytona delete ${SANDBOX}`);
	await $`daytona delete ${SANDBOX} --force --quiet`;
}
