/**
 * Port probing utilities for the headless recorder.
 *
 * Split out from lifecycle.ts so it can be imported without pulling in
 * the fs/path/os surface — useful for tests that just want to check
 * port availability in isolation.
 *
 * @module electron/headless-recorder/find-port
 */

import { createServer } from "node:net";

/** Probe whether a TCP port is free on 127.0.0.1 by binding a test server. */
export function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => {
			resolve(false);
		});
		server.once("listening", () => {
			server.close(() => resolve(true));
		});
		try {
			server.listen(port, "127.0.0.1");
		} catch {
			resolve(false);
		}
	});
}

/**
 * Return `preferredPort` if free, otherwise a free port in
 * [rangeStart, rangeEnd]. Throws if no port in the range is available.
 */
export async function findFreePort(opts: {
	preferredPort?: number;
	rangeStart?: number;
	rangeEnd?: number;
	maxAttempts?: number;
}): Promise<number> {
	const preferred = opts.preferredPort ?? 8765;
	const start = opts.rangeStart ?? 12_000;
	const end = opts.rangeEnd ?? 13_000;
	const maxAttempts = opts.maxAttempts ?? 20;

	if (await isPortFree(preferred)) return preferred;

	for (let i = 0; i < maxAttempts; i++) {
		const candidate = start + Math.floor(Math.random() * (end - start + 1));
		if (await isPortFree(candidate)) return candidate;
	}

	throw new Error(
		`No free port found after ${maxAttempts} attempts in [${start}, ${end}]`
	);
}
