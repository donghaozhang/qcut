import { describe, expect, it } from "vitest";
import { nextPortAction, resolveRendererTarget } from "../launch-policy";

describe("nextPortAction", () => {
	it("retries the next port on EADDRINUSE below the max", () => {
		expect(
			nextPortAction({ code: "EADDRINUSE", port: 8080, maxPort: 8090 })
		).toBe("retry-next");
	});

	it("retries the next port on EACCES below the max (Windows excluded port ranges)", () => {
		expect(nextPortAction({ code: "EACCES", port: 8085, maxPort: 8090 })).toBe(
			"retry-next"
		);
	});

	it("falls back to an OS-assigned port once the max is reached", () => {
		expect(
			nextPortAction({ code: "EADDRINUSE", port: 8090, maxPort: 8090 })
		).toBe("fallback-random");
		expect(nextPortAction({ code: "EACCES", port: 8090, maxPort: 8090 })).toBe(
			"fallback-random"
		);
	});

	it("rejects when the OS-assigned fallback itself fails", () => {
		expect(nextPortAction({ code: "EACCES", port: 0, maxPort: 8090 })).toBe(
			"reject"
		);
	});

	it("rejects error codes that retrying cannot help", () => {
		expect(nextPortAction({ code: "EPERM", port: 8080, maxPort: 8090 })).toBe(
			"reject"
		);
		expect(nextPortAction({ code: undefined, port: 8080, maxPort: 8090 })).toBe(
			"reject"
		);
	});
});

describe("resolveRendererTarget", () => {
	it("ignores inherited NODE_ENV=development in packaged builds", () => {
		expect(
			resolveRendererTarget({ isPackaged: true, nodeEnv: "development" })
		).toEqual({ isDev: false, url: "app://./index.html" });
	});

	it("loads the bundled renderer in packaged builds", () => {
		expect(
			resolveRendererTarget({ isPackaged: true, nodeEnv: undefined })
		).toEqual({ isDev: false, url: "app://./index.html" });
	});

	it("loads the dev server when unpackaged in development", () => {
		expect(
			resolveRendererTarget({ isPackaged: false, nodeEnv: "development" })
		).toEqual({ isDev: true, url: "http://localhost:5173" });
	});

	it("loads the bundled renderer when unpackaged outside development", () => {
		expect(
			resolveRendererTarget({ isPackaged: false, nodeEnv: undefined })
		).toEqual({ isDev: false, url: "app://./index.html" });
		expect(
			resolveRendererTarget({ isPackaged: false, nodeEnv: "production" })
		).toEqual({ isDev: false, url: "app://./index.html" });
	});
});
