/**
 * Playwright fixture launching an isolated QCut Electron instance.
 *
 * A temporary user-data directory sidesteps the single-instance lock so the
 * test can coexist with a running QCut, and a dedicated QCUT_API_PORT keeps
 * the editor HTTP bridge off the user's port. Tests receive the allocated
 * port as the `apiPort` fixture.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import { test as qcutTest } from "./electron-helpers";

export async function findAvailablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Could not allocate an API port");
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return address.port;
}

export const isolatedElectronTest = qcutTest.extend<{ apiPort: number }>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	apiPort: async ({}, use) => {
		await use(await findAvailablePort());
	},
	electronApp: async ({ apiPort }, use) => {
		const userDataDirectory = await mkdtemp(
			path.join(tmpdir(), "qcut-isolated-e2e-")
		);
		const electronApp = await electron.launch({
			args: ["dist/electron/main.js", `--user-data-dir=${userDataDirectory}`],
			env: {
				...process.env,
				ELECTRON_DISABLE_GPU: "1",
				NODE_ENV: "test",
				QCUT_API_PORT: String(apiPort),
			},
		});
		await use(electronApp);
		await electronApp.close();
		await rm(userDataDirectory, { force: true, recursive: true });
	},
});
