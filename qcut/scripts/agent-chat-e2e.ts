#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const DEFAULT_URL = "https://quriosity.com.au/chat-agent.html";
const LOCAL_AGENT_CHAT_JS = resolve(
	process.cwd(),
	"packages/nexusai-website/js/agent-chat.js"
);

declare global {
	interface Window {
		PaymentAPI?: {
			getApiBaseUrl?: () => string;
			getAuthToken?: () => string;
		};
	}
}

type StepStatus = "passed" | "failed" | "warning";

type StepResult = {
	name: string;
	status: StepStatus;
	durationMs: number;
	screenshot?: string;
	detail?: string;
};

type Config = {
	url: string;
	outDir: string;
	headed: boolean;
	injectLocalAgentChatJs: boolean;
	waitNoAutoConnectMs: number;
	connectTimeoutMs: number;
	promptTimeoutMs: number;
	artifactTimeoutMs: number;
};

type RunState = {
	browser: Browser;
	page: Page;
	config: Config;
	runId: string;
	steps: StepResult[];
};

function readOption({
	argv,
	name,
}: {
	argv: string[];
	name: string;
}): string {
	const index = argv.indexOf(name);
	if (index === -1) {
		return "";
	}
	return argv[index + 1] || "";
}

function hasFlag({ argv, name }: { argv: string[]; name: string }): boolean {
	return argv.includes(name);
}

function readNumberOption({
	argv,
	name,
	defaultValue,
}: {
	argv: string[];
	name: string;
	defaultValue: number;
}): number {
	const raw = readOption({ argv, name });
	if (raw.length === 0) {
		return defaultValue;
	}
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function parseArgs({ argv }: { argv: string[] }): Config {
	if (hasFlag({ argv, name: "--help" }) || hasFlag({ argv, name: "-h" })) {
		printHelp();
		process.exit(0);
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const defaultOutDir = join(
		process.cwd(),
		"output/playwright",
		`agent-chat-e2e-${timestamp}`
	);
	return {
		url:
			readOption({ argv, name: "--url" }) ||
			process.env.AGENT_CHAT_E2E_URL ||
			DEFAULT_URL,
		outDir: resolve(readOption({ argv, name: "--out-dir" }) || defaultOutDir),
		headed:
			hasFlag({ argv, name: "--headed" }) ||
			hasFlag({ argv, name: "--headful" }),
		injectLocalAgentChatJs: hasFlag({
			argv,
			name: "--inject-local-agent-chat-js",
		}),
		waitNoAutoConnectMs: readNumberOption({
			argv,
			name: "--wait-no-auto-connect-ms",
			defaultValue: 8_000,
		}),
		connectTimeoutMs: readNumberOption({
			argv,
			name: "--connect-timeout-ms",
			defaultValue: 240_000,
		}),
		promptTimeoutMs: readNumberOption({
			argv,
			name: "--prompt-timeout-ms",
			defaultValue: 180_000,
		}),
		artifactTimeoutMs: readNumberOption({
			argv,
			name: "--artifact-timeout-ms",
			defaultValue: 180_000,
		}),
	};
}

function printHelp() {
	console.log(`QCut Chat Agent E2E

Usage:
  bun scripts/agent-chat-e2e.ts [options]

Options:
  --url <url>                         Chat Agent URL. Default: ${DEFAULT_URL}
  --out-dir <path>                    Screenshot/result output directory.
  --headed, --headful                 Show the browser.
  --inject-local-agent-chat-js        Route js/agent-chat.js to the local file while keeping the page origin.
  --wait-no-auto-connect-ms <ms>      Initial no-click wait. Default: 8000.
  --connect-timeout-ms <ms>           Connect/Codex ready timeout. Default: 240000.
  --prompt-timeout-ms <ms>            Prompt completion timeout. Default: 180000.
  --artifact-timeout-ms <ms>          Artifact visibility timeout. Default: 180000.
`);
}

function log({ message }: { message: string }) {
	console.log(`[agent-chat-e2e] ${message}`);
}

function countOccurrences({
	value,
	needle,
}: {
	value: string;
	needle: string;
}): number {
	if (needle.length === 0) {
		return 0;
	}
	return value.split(needle).length - 1;
}

async function screenshot({
	page,
	outDir,
	name,
}: {
	page: Page;
	outDir: string;
	name: string;
}): Promise<string> {
	const path = join(outDir, `${name}.png`);
	await page.screenshot({ path, fullPage: true });
	return path;
}

async function readText({
	page,
	selector,
}: {
	page: Page;
	selector: string;
}): Promise<string> {
	try {
		return await page.locator(selector).innerText({ timeout: 2_000 });
	} catch {
		return "";
	}
}

async function readTerminalText({ page }: { page: Page }): Promise<string> {
	return readText({ page, selector: "#agent-terminal" });
}

async function readTerminalStatus({ page }: { page: Page }): Promise<string> {
	return (
		await page.locator("#agent-terminal-status").innerText({ timeout: 5_000 })
	).trim();
}

async function runStep({
	state,
	name,
	screenshotName,
	action,
}: {
	state: RunState;
	name: string;
	screenshotName: string;
	action: () => Promise<string | undefined>;
}): Promise<void> {
	const start = Date.now();
	try {
		const detail = await action();
		const image = await screenshot({
			page: state.page,
			outDir: state.config.outDir,
			name: screenshotName,
		});
		const durationMs = Date.now() - start;
		state.steps.push({
			name,
			status: "passed",
			durationMs,
			screenshot: image,
			detail,
		});
		log({ message: `PASS ${name} (${durationMs}ms)` });
	} catch (error) {
		const image = await screenshot({
			page: state.page,
			outDir: state.config.outDir,
			name: `${screenshotName}-failed`,
		});
		const durationMs = Date.now() - start;
		const detail = error instanceof Error ? error.message : String(error);
		state.steps.push({
			name,
			status: "failed",
			durationMs,
			screenshot: image,
			detail,
		});
		throw error;
	}
}

function assertCondition({
	condition,
	message,
}: {
	condition: boolean;
	message: string;
}) {
	if (!condition) {
		throw new Error(message);
	}
}

async function setupLocalJsRoute({
	page,
	enabled,
}: {
	page: Page;
	enabled: boolean;
}) {
	if (!enabled) {
		return;
	}
	const source = readFileSync(LOCAL_AGENT_CHAT_JS, "utf8");
	await page.route("**/js/agent-chat.js", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/javascript",
			body: source,
		});
	});
}

async function waitForCodexReady({
	page,
	timeoutMs,
}: {
	page: Page;
	timeoutMs: number;
}) {
	await page.waitForFunction(
		() => {
			const status = document
				.querySelector("#agent-terminal-status")
				?.textContent?.trim();
			const terminalText =
				document.querySelector("#agent-terminal")?.textContent || "";
			return status === "connected" && terminalText.includes("OpenAI Codex");
		},
		null,
		{ timeout: timeoutMs }
	);
}

async function waitForTerminalCompletionMarker({
	page,
	marker,
	beforeCount,
	timeoutMs,
}: {
	page: Page;
	marker: string;
	beforeCount: number;
	timeoutMs: number;
}) {
	await page.waitForFunction(
		({ expectedMarker, previousCount }) => {
			const text = document.querySelector("#agent-terminal")?.textContent || "";
			const count = text.split(expectedMarker).length - 1;
			return count > previousCount + 1 || text.includes(`• ${expectedMarker}`);
		},
		{ expectedMarker: marker, previousCount: beforeCount },
		{ timeout: timeoutMs }
	);
}

async function submitPrompt({
	page,
	prompt,
}: {
	page: Page;
	prompt: string;
}) {
	await page.locator("#agent-prompt").fill(prompt);
	await page.locator("#agent-submit").click();
}

async function waitForArtifact({
	page,
	filename,
	timeoutMs,
}: {
	page: Page;
	filename: string;
	timeoutMs: number;
}) {
	await page.waitForFunction(
		(expectedFilename) => {
			const text = document.querySelector("#agent-artifacts")?.textContent || "";
			return text.includes(expectedFilename);
		},
		filename,
		{ timeout: timeoutMs }
	);
}

async function downloadArtifactWithButton({
	page,
	filename,
	outDir,
}: {
	page: Page;
	filename: string;
	outDir: string;
}): Promise<string> {
	const row = page.locator("#agent-artifacts .card", { hasText: filename });
	const button = row.getByRole("button", { name: "Download" });
	const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
	await button.click();
	const download = await downloadPromise;
	const targetPath = join(outDir, `downloaded-${basename(filename)}`);
	await download.saveAs(targetPath);
	return targetPath;
}

async function fetchArtifactTextFromPage({
	page,
	filename,
}: {
	page: Page;
	filename: string;
}): Promise<string> {
	return page.evaluate(async (artifactFilename) => {
		const apiBase =
			window.PaymentAPI?.getApiBaseUrl?.() ||
			"https://qcut-license-server.zdhpeter.workers.dev";
		const token = window.PaymentAPI?.getAuthToken?.() || "";
		const sessionId = window.localStorage.getItem("qcut_agent_session_id") || "";
		if (sessionId.length === 0) {
			throw new Error("missing agent session id");
		}
		const response = await fetch(
			`${apiBase}/api/agent/sessions/${encodeURIComponent(
				sessionId
			)}/artifacts/${encodeURIComponent(artifactFilename)}/download`,
			{
				headers:
					token.length === 0 ? {} : { Authorization: `Bearer ${token}` },
			}
		);
		if (!response.ok) {
			throw new Error(`download fetch failed with ${response.status}`);
		}
		return response.text();
	}, filename);
}

async function disconnectTerminal({ page }: { page: Page }) {
	await page.locator("#agent-terminal-disconnect").click();
	await page.waitForFunction(
		() =>
			document.querySelector("#agent-terminal-status")?.textContent?.trim() ===
			"disconnected",
		null,
		{ timeout: 30_000 }
	);
}

async function main() {
	const config = parseArgs({ argv: process.argv.slice(2) });
	mkdirSync(config.outDir, { recursive: true });

	const runId = String(Date.now());
	const browser = await chromium.launch({ headless: !config.headed });
	const page = await browser.newPage({
		acceptDownloads: true,
		viewport: { width: 1180, height: 920 },
	});
	const state: RunState = { browser, page, config, runId, steps: [] };

	let exitCode = 0;
	try {
		await setupLocalJsRoute({
			page,
			enabled: config.injectLocalAgentChatJs,
		});

		await runStep({
			state,
			name: "load page without auto-connect",
			screenshotName: "01-initial-load",
			action: async () => {
				await page.goto(config.url, {
					waitUntil: "domcontentloaded",
					timeout: 60_000,
				});
				await page.waitForTimeout(500);
				const status = await readTerminalStatus({ page });
				const terminalText = await readTerminalText({ page });
				assertCondition({
					condition: status === "disconnected",
					message: `expected disconnected after load, got ${status}`,
				});
				assertCondition({
					condition: !terminalText.includes("OpenAI Codex"),
					message: "Codex started before the user clicked Connect",
				});
				return `status=${status}`;
			},
		});

		await runStep({
			state,
			name: "stay disconnected before click",
			screenshotName: "02-no-click-still-disconnected",
			action: async () => {
				await page.waitForTimeout(config.waitNoAutoConnectMs);
				const status = await readTerminalStatus({ page });
				const terminalText = await readTerminalText({ page });
				assertCondition({
					condition: status === "disconnected",
					message: `expected disconnected after waiting, got ${status}`,
				});
				assertCondition({
					condition: !terminalText.includes("OpenAI Codex"),
					message: "Codex started during the no-click wait",
				});
				return `waited=${config.waitNoAutoConnectMs}ms`;
			},
		});

		await runStep({
			state,
			name: "manual connect opens Codex",
			screenshotName: "03-connect-codex-ready",
			action: async () => {
				await page.locator("#agent-terminal-connect").click();
				await waitForCodexReady({
					page,
					timeoutMs: config.connectTimeoutMs,
				});
				return "Codex ready in Daytona PTY";
			},
		});

		const turnOneMarker = `AGENT_E2E_TURN_ONE_${runId}`;
		await runStep({
			state,
			name: "turn one reaches persistent Codex",
			screenshotName: "04-turn-one",
			action: async () => {
				const beforeText = await readTerminalText({ page });
				const beforeCount = countOccurrences({
					value: beforeText,
					needle: turnOneMarker,
				});
				await submitPrompt({
					page,
					prompt: `Reply with only this exact marker on its own line: ${turnOneMarker}`,
				});
				await waitForTerminalCompletionMarker({
					page,
					marker: turnOneMarker,
					beforeCount,
					timeoutMs: config.promptTimeoutMs,
				});
				return `marker=${turnOneMarker}`;
			},
		});

		const artifactFilename = `agent-e2e-${runId}.txt`;
		const artifactText = `agent e2e artifact ${runId}`;
		await runStep({
			state,
			name: "turn two creates an artifact",
			screenshotName: "05-artifact-visible",
			action: async () => {
				await submitPrompt({
					page,
					prompt: [
						"Run this exact shell command in the sandbox:",
						`mkdir -p /tmp/qcut-output && printf '${artifactText}\\n' > /tmp/qcut-output/${artifactFilename}`,
						`After it succeeds, reply with ARTIFACT_DONE_${runId} and the file path.`,
					].join("\n"),
				});
				await waitForArtifact({
					page,
					filename: artifactFilename,
					timeoutMs: config.artifactTimeoutMs,
				});
				return `artifact=${artifactFilename}`;
			},
		});

		await runStep({
			state,
			name: "artifact downloads from the web UI",
			screenshotName: "06-artifact-download",
			action: async () => {
				const downloadedPath = await downloadArtifactWithButton({
					page,
					filename: artifactFilename,
					outDir: config.outDir,
				});
				const fetchedText = await fetchArtifactTextFromPage({
					page,
					filename: artifactFilename,
				});
				assertCondition({
					condition: fetchedText.trim() === artifactText,
					message: `artifact content mismatch: ${fetchedText.trim()}`,
				});
				return `downloaded=${downloadedPath}`;
			},
		});

		await runStep({
			state,
			name: "disconnect clears terminal state",
			screenshotName: "07-disconnected-clean",
			action: async () => {
				await disconnectTerminal({ page });
				await page.waitForTimeout(300);
				const jobStatus = (
					await page.locator("#agent-job-status").innerText({
						timeout: 5_000,
					})
				).trim();
				const terminalText = await readTerminalText({ page });
				assertCondition({
					condition: jobStatus === "idle",
					message: `expected job status idle after disconnect, got ${jobStatus}`,
				});
				assertCondition({
					condition: !terminalText.includes("OpenAI Codex"),
					message: "disconnect left stale Codex text in the terminal",
				});
				return "terminal reset";
			},
		});

		await runStep({
			state,
			name: "reconnect opens Codex again",
			screenshotName: "08-reconnect-codex-ready",
			action: async () => {
				await page.locator("#agent-terminal-connect").click();
				await waitForCodexReady({
					page,
					timeoutMs: config.connectTimeoutMs,
				});
				return "Codex ready after reconnect";
			},
		});
	} catch (error) {
		exitCode = 1;
		log({
			message:
				error instanceof Error
					? `FAILED ${error.message}`
					: `FAILED ${String(error)}`,
		});
	} finally {
		const resultPath = join(config.outDir, "result.json");
		const payload = {
			status: exitCode === 0 ? "passed" : "failed",
			runId,
			url: config.url,
			injectLocalAgentChatJs: config.injectLocalAgentChatJs,
			outDir: config.outDir,
			steps: state.steps,
		};
		writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
		log({ message: `result=${resultPath}` });
		await browser.close();
	}

	process.exit(exitCode);
}

void main().catch((error: unknown) => {
	log({
		message:
			error instanceof Error
				? `UNHANDLED ${error.message}`
				: `UNHANDLED ${String(error)}`,
	});
	process.exit(1);
});
