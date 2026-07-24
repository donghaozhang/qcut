import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Protocol } from "electron";
import { afterEach, describe, expect, it } from "vitest";
import {
	HyperframesOutputRegistry,
	hyperframesOutputRegistry,
} from "../hyperframes/output-registry";
import {
	HYPERFRAMES_PROTOCOL,
	registerHyperframesProtocol,
} from "../hyperframes/protocol";
import { HyperframesSessionRegistry } from "../hyperframes/session-registry";

const temporaryPaths: string[] = [];

afterEach(() => {
	for (const temporaryPath of temporaryPaths.splice(0)) {
		fs.rmSync(temporaryPath, { recursive: true, force: true });
	}
	hyperframesOutputRegistry.release({ sessionId: "hyperframes-output-test" });
});

describe("HyperFrames output protocol", () => {
	it("stores and releases output sessions", () => {
		const registry = new HyperframesOutputRegistry();
		const session = {
			sessionId: "session",
			outputPath: "/tmp/output.mov",
			browserOutputPath: "/tmp/output.webm",
			sessionDirectory: "/tmp/session",
		};

		registry.register({ session });
		expect(registry.get({ sessionId: "session" })).toEqual(session);
		expect(registry.release({ sessionId: "session" })).toEqual(session);
		expect(registry.get({ sessionId: "session" })).toBeNull();
	});

	it("serves a byte range from the browser preview WebM", async () => {
		const directory = fs.mkdtempSync(
			path.join(os.tmpdir(), "qcut-hyperframes-output-")
		);
		temporaryPaths.push(directory);
		const outputPath = path.join(directory, "composition.mov");
		const browserOutputPath = path.join(directory, "composition.webm");
		fs.writeFileSync(outputPath, Buffer.from([6, 7, 8]));
		fs.writeFileSync(browserOutputPath, Buffer.from([0, 1, 2, 3, 4, 5]));
		hyperframesOutputRegistry.register({
			session: {
				sessionId: "hyperframes-output-test",
				outputPath,
				browserOutputPath,
				sessionDirectory: directory,
			},
		});

		let handler: ((request: Request) => Promise<Response>) | undefined;
		const targetProtocol = {
			handle: (
				scheme: string,
				nextHandler: (request: Request) => Promise<Response>
			) => {
				expect(scheme).toBe(HYPERFRAMES_PROTOCOL);
				handler = nextHandler;
			},
		};
		registerHyperframesProtocol({
			targetProtocol: targetProtocol as unknown as Pick<Protocol, "handle">,
			registry: new HyperframesSessionRegistry(),
		});

		const response = await handler?.(
			new Request(
				"qcut-hyperframes://hyperframes-output-test/composition.webm",
				{ headers: { Range: "bytes=1-3" } }
			)
		);
		expect(response?.status).toBe(206);
		expect(response?.headers.get("content-type")).toBe("video/webm");
		expect(response?.headers.get("content-range")).toBe("bytes 1-3/6");
		expect(response?.headers.get("cross-origin-resource-policy")).toBe(
			"cross-origin"
		);
		expect(response?.headers.get("access-control-allow-origin")).toBe("*");
		expect(
			Array.from(
				new Uint8Array((await response?.arrayBuffer()) ?? new ArrayBuffer())
			)
		).toEqual([1, 2, 3]);
	});
});
