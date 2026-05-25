import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

const ENTRYPOINT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../electron/native-pipeline/container/entrypoint.sh"
);

function base64Url(input: string): string {
	return Buffer.from(input, "utf8")
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function makeAccessToken({ exp }: { exp: number }): string {
	return [
		base64Url(JSON.stringify({ alg: "none", typ: "JWT" })),
		base64Url(JSON.stringify({ exp })),
		"signature",
	].join(".");
}

async function makeFakeCodex({ dir }: { dir: string }) {
	const bin = join(dir, "codex");
	const calls = join(dir, "codex-calls.txt");
	const loginStdin = join(dir, "codex-login-stdin.txt");
	await writeFile(
		bin,
		[
			"#!/usr/bin/env bash",
			"set -euo pipefail",
			'if [[ "${1:-}" == "login" && "${2:-}" == "--with-api-key" ]]; then',
			'  cat > "${FAKE_CODEX_LOGIN_STDIN}"',
			'  printf "login:%s\\n" "$*" >> "${FAKE_CODEX_CALLS}"',
			"  exit 0",
			"fi",
			'printf "cmd:%s\\n" "$*" >> "${FAKE_CODEX_CALLS}"',
			'printf "fake-codex:%s\\n" "$*"',
			"",
		].join("\n")
	);
	await chmod(bin, 0o755);
	return { bin, calls, loginStdin };
}

describe("qcut-entrypoint Codex auth bootstrap", () => {
	it("ignores expired CODEX_AUTH_JSON and falls back to OPENAI_API_KEY login", async () => {
		const dir = await mkdtemp(join(tmpdir(), "qcut-entrypoint-"));
		try {
			const fakeCodex = await makeFakeCodex({ dir });
			const codeHome = join(dir, ".codex");
			const expiredAuth = JSON.stringify({
				auth_mode: "chatgpt",
				tokens: {
					access_token: makeAccessToken({ exp: 1 }),
					refresh_token: "already-used",
				},
			});

			const result = await execa("bash", [ENTRYPOINT, "codex", "--version"], {
				env: {
					HOME: dir,
					CODEX_HOME: codeHome,
					CODEX_BIN: fakeCodex.bin,
					CODEX_AUTH_JSON: expiredAuth,
					OPENAI_API_KEY: "sk-test",
					QCUT_BOOTSTRAP_CODEX: "1",
					FAKE_CODEX_CALLS: fakeCodex.calls,
					FAKE_CODEX_LOGIN_STDIN: fakeCodex.loginStdin,
				},
				reject: false,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toContain("CODEX_AUTH_JSON access token is expired");
			await expect(readFile(join(codeHome, "auth.json"), "utf8")).rejects.toThrow();
			expect(await readFile(fakeCodex.loginStdin, "utf8")).toBe("sk-test");
			expect(await readFile(fakeCodex.calls, "utf8")).toBe(
				"login:login --with-api-key\ncmd:--version\n"
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("preserves non-expired CODEX_AUTH_JSON without API-key login", async () => {
		const dir = await mkdtemp(join(tmpdir(), "qcut-entrypoint-"));
		try {
			const fakeCodex = await makeFakeCodex({ dir });
			const codeHome = join(dir, ".codex");
			const validAuth = JSON.stringify({
				auth_mode: "chatgpt",
				tokens: {
					access_token: makeAccessToken({
						exp: Math.floor(Date.now() / 1000) + 3600,
					}),
					refresh_token: "fresh",
				},
			});

			const result = await execa("bash", [ENTRYPOINT, "codex", "--version"], {
				env: {
					HOME: dir,
					CODEX_HOME: codeHome,
					CODEX_BIN: fakeCodex.bin,
					CODEX_AUTH_JSON: validAuth,
					OPENAI_API_KEY: "sk-test",
					QCUT_BOOTSTRAP_CODEX: "1",
					FAKE_CODEX_CALLS: fakeCodex.calls,
					FAKE_CODEX_LOGIN_STDIN: fakeCodex.loginStdin,
				},
				reject: false,
			});

			expect(result.exitCode).toBe(0);
			expect(await readFile(join(codeHome, "auth.json"), "utf8")).toBe(validAuth);
			expect(await readFile(fakeCodex.calls, "utf8")).toBe("cmd:--version\n");
			await expect(readFile(fakeCodex.loginStdin, "utf8")).rejects.toThrow();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
