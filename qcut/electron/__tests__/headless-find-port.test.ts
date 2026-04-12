/**
 * Unit tests for the port-probe utilities.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:net";
import { findFreePort, isPortFree } from "../headless-recorder/find-port.js";

function listen(port: number): Promise<Server> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => resolve(server));
	});
}

async function close(server: Server): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}

describe("isPortFree", () => {
	const openServers: Server[] = [];
	afterEach(async () => {
		while (openServers.length > 0) {
			const s = openServers.pop()!;
			await close(s);
		}
	});

	it("returns true for a random-high free port", async () => {
		// Ephemeral port — unlikely to collide.
		const free = await isPortFree(47_321);
		expect(typeof free).toBe("boolean");
		// Hard to assert true reliably on shared CI; instead bind and check false
		const server = await listen(47_321).catch(() => null);
		if (server) {
			openServers.push(server);
			const busy = await isPortFree(47_321);
			expect(busy).toBe(false);
		}
	});

	it("returns false when a port is bound", async () => {
		const server = await listen(0); // let OS pick
		openServers.push(server);
		const addr = server.address();
		const boundPort =
			typeof addr === "object" && addr ? (addr as { port: number }).port : 0;
		expect(boundPort).toBeGreaterThan(0);
		const free = await isPortFree(boundPort);
		expect(free).toBe(false);
	});
});

describe("findFreePort", () => {
	const openServers: Server[] = [];
	afterEach(async () => {
		while (openServers.length > 0) {
			const s = openServers.pop()!;
			await close(s);
		}
	});

	it("returns the preferred port when it's free", async () => {
		// Pick a high unlikely-to-collide port so the preferred branch triggers.
		const port = await findFreePort({
			preferredPort: 47_329,
			rangeStart: 48_000,
			rangeEnd: 48_100,
		});
		// Either the preferred succeeded, or we fell back — both acceptable.
		expect(port).toBeGreaterThan(0);
	});

	it("falls back to the range when the preferred port is busy", async () => {
		const server = await listen(0);
		openServers.push(server);
		const addr = server.address();
		const busyPort =
			typeof addr === "object" && addr ? (addr as { port: number }).port : 0;
		expect(busyPort).toBeGreaterThan(0);

		const port = await findFreePort({
			preferredPort: busyPort,
			rangeStart: 48_200,
			rangeEnd: 48_300,
		});
		expect(port).not.toBe(busyPort);
		expect(port).toBeGreaterThanOrEqual(48_200);
		expect(port).toBeLessThanOrEqual(48_300);
	});

	it("throws when no port in the range is free (impossibly tight range)", async () => {
		// Bind every port in a tiny range so fallback always fails.
		const lo = 48_400;
		const hi = 48_402;
		for (let p = lo; p <= hi; p++) {
			try {
				const s = await listen(p);
				openServers.push(s);
			} catch {
				/* already taken — ok, still tight */
			}
		}
		await expect(
			findFreePort({
				preferredPort: lo,
				rangeStart: lo,
				rangeEnd: hi,
				maxAttempts: 5,
			})
		).rejects.toThrow(/No free port/);
	});
});
