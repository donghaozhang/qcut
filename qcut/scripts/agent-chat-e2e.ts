#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const DEFAULT_URL = "https://quriosity.com.au/chat-agent.html";
const DEFAULT_LICENSE_SERVER_URL =
	"https://qcut-license-server.zdhpeter.workers.dev";
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
	licenseServerUrl: string;
	outDir: string;
	headed: boolean;
	injectLocalAgentChatJs: boolean;
	waitNoAutoConnectMs: number;
	connectTimeoutMs: number;
	promptTimeoutMs: number;
	artifactTimeoutMs: number;
	resetSessionBeforeConnect: boolean;
	terminalPrompt: string;
	terminalPromptEchoNeedle: string;
	expectedArtifacts: string[];
	expectedArtifactText: Array<{ filename: string; contains: string }>;
};

type RunState = {
	browser: Browser;
	page: Page;
	config: Config;
	runId: string;
	steps: StepResult[];
};

/** Return the value following a single-value CLI option, or "" if absent. */
function readOption({ argv, name }: { argv: string[]; name: string }): string {
	const index = argv.indexOf(name);
	if (index === -1) {
		return "";
	}
	return argv[index + 1] || "";
}

/**
 * Collect every value for a repeatable CLI option (e.g. `--expect-artifact`).
 * Flag-like values (starting with `-`) are skipped so a value-less option does
 * not accidentally swallow the next flag.
 */
function readRepeatedOptions({
	argv,
	name,
}: {
	argv: string[];
	name: string;
}): string[] {
	const values: string[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] !== name) continue;
		const value = argv[index + 1] || "";
		if (value.length > 0 && !value.startsWith("-")) {
			values.push(value);
			index += 1;
		}
	}
	return values;
}

/** Return whether a boolean CLI flag is present in argv. */
function hasFlag({ argv, name }: { argv: string[]; name: string }): boolean {
	return argv.includes(name);
}

/** Read a positive, finite numeric CLI option, falling back to defaultValue. */
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

/** Parse `filename=substring` pairs into artifact-text assertion objects. */
function parseExpectedArtifactText({
	values,
}: {
	values: string[];
}): Array<{ filename: string; contains: string }> {
	const expectations: Array<{ filename: string; contains: string }> = [];
	for (const value of values) {
		const separator = value.indexOf("=");
		if (separator <= 0) {
			throw new Error(
				`--expect-artifact-text must use filename=substring, got ${value}`
			);
		}
		const filename = value.slice(0, separator).trim();
		const contains = value.slice(separator + 1);
		if (filename.length === 0 || contains.length === 0) {
			throw new Error(
				`--expect-artifact-text must include both filename and substring, got ${value}`
			);
		}
		expectations.push({ filename, contains });
	}
	return expectations;
}

/** Resolve the custom terminal prompt from `--terminal-prompt-file` or `--terminal-prompt`. */
function readTerminalPrompt({ argv }: { argv: string[] }): string {
	const promptFile = readOption({ argv, name: "--terminal-prompt-file" });
	if (promptFile.length > 0) {
		return readFileSync(resolve(promptFile), "utf8").trim();
	}
	return readOption({ argv, name: "--terminal-prompt" }).trim();
}

/** Build the run {@link Config} from raw CLI argv, applying env and defaults. */
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
		licenseServerUrl:
			readOption({ argv, name: "--license-server-url" }) ||
			process.env.QCUT_LICENSE_SERVER_URL ||
			DEFAULT_LICENSE_SERVER_URL,
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
		resetSessionBeforeConnect: !hasFlag({
			argv,
			name: "--skip-session-reset",
		}),
		terminalPrompt: readTerminalPrompt({ argv }),
		terminalPromptEchoNeedle: readOption({
			argv,
			name: "--terminal-prompt-echo-needle",
		}),
		expectedArtifacts: readRepeatedOptions({
			argv,
			name: "--expect-artifact",
		}),
		expectedArtifactText: parseExpectedArtifactText({
			values: readRepeatedOptions({
				argv,
				name: "--expect-artifact-text",
			}),
		}),
	};
}

/** Print CLI usage and the full option list to stdout. */
function printHelp() {
	console.log(`QCut Chat Agent E2E

Usage:
  bun scripts/agent-chat-e2e.ts [options]

Options:
  --url <url>                         Chat Agent URL. Default: ${DEFAULT_URL}
  --license-server-url <url>          License server base URL fallback when
                                      window.PaymentAPI is unavailable. Also
                                      reads QCUT_LICENSE_SERVER_URL env.
                                      Default: ${DEFAULT_LICENSE_SERVER_URL}
  --out-dir <path>                    Screenshot/result output directory.
  --headed, --headful                 Show the browser.
  --inject-local-agent-chat-js        Route js/agent-chat.js to the local file while keeping the page origin.
  --wait-no-auto-connect-ms <ms>      Initial no-click wait. Default: 8000.
  --connect-timeout-ms <ms>           Connect/Codex ready timeout. Default: 240000.
  --prompt-timeout-ms <ms>            Prompt completion timeout. Default: 180000.
  --artifact-timeout-ms <ms>          Artifact visibility timeout. Default: 180000.
  --skip-session-reset                Reuse the current active server-side session.
  --terminal-prompt <text>            Run this custom prompt after Codex connects.
  --terminal-prompt-file <path>       Read the custom prompt from a file.
  --terminal-prompt-echo-needle <str> Wait until terminal echoes this text after input.
  --expect-artifact <filename>        Wait for an artifact filename. Repeatable.
  --expect-artifact-text <file=text>  Download artifact and assert it contains text. Repeatable.
`);
}

/** Write a namespaced `[agent-chat-e2e]` line to the console. */
function log({ message }: { message: string }) {
	console.log(`[agent-chat-e2e] ${message}`);
}

/** Capture a full-page screenshot into outDir and return its file path. */
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

/** Read a selector's innerText, returning "" if it is not found within 2s. */
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

/** Read the visible text of the terminal pane. */
async function readTerminalText({ page }: { page: Page }): Promise<string> {
	return readText({ page, selector: "#agent-terminal" });
}

/** Read and trim the terminal connection status (e.g. "connected"). */
async function readTerminalStatus({ page }: { page: Page }): Promise<string> {
	return (
		await page.locator("#agent-terminal-status").innerText({ timeout: 5_000 })
	).trim();
}

/** Read the text of the terminal debug pane (relay ack diagnostics). */
async function readTerminalDebug({ page }: { page: Page }): Promise<string> {
	return readText({ page, selector: "#agent-terminal-debug" });
}

/**
 * Run a named test step: execute its action, screenshot the result, and record
 * a passed/failed {@link StepResult}. Re-throws on failure after capturing a
 * `-failed` screenshot.
 */
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

/** Throw an Error with the given message when condition is false. */
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

/** When enabled, serve the local agent-chat.js for the page's JS request. */
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

/** Wait until the terminal reports "connected" and shows the OpenAI Codex banner. */
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

/** Read the agent session id persisted in localStorage, or "" if none. */
async function readStoredAgentSessionId({ page }: { page: Page }) {
	return page.evaluate(
		() => window.localStorage.getItem("qcut_agent_session_id") || ""
	);
}

/** Wait for the debug pane to show a relay input-ack line (`ack #N N bytes`). */
async function waitForRelayInputAck({ page }: { page: Page }) {
	await page.waitForFunction(
		() => {
			const debugText =
				document.querySelector("#agent-terminal-debug")?.textContent || "";
			return /ack #\d+ \d+ bytes/.test(debugText);
		},
		null,
		{ timeout: 15_000 }
	);
}

/**
 * Connect to establish a server session, then start a fresh one via the UI.
 * Returns the ended session id (or a note when none was stored).
 */
async function resetServerSessionThroughUi({
	page,
	timeoutMs,
}: {
	page: Page;
	timeoutMs: number;
}) {
	await page.locator("#agent-terminal-connect").click();
	await page.waitForFunction(
		() => {
			const status = document
				.querySelector("#agent-terminal-status")
				?.textContent?.trim();
			const sessionId =
				window.localStorage.getItem("qcut_agent_session_id") || "";
			return status === "connected" && sessionId.length > 0;
		},
		null,
		{ timeout: timeoutMs }
	);
	const oldSessionId = await page.evaluate(
		() => window.localStorage.getItem("qcut_agent_session_id") || ""
	);
	await page.locator("#agent-new-session").click();
	await page.waitForFunction(
		() => {
			const status = document
				.querySelector("#agent-terminal-status")
				?.textContent?.trim();
			const sessionId =
				window.localStorage.getItem("qcut_agent_session_id") || "";
			return status === "disconnected" && sessionId.length === 0;
		},
		null,
		{ timeout: timeoutMs }
	);
	return oldSessionId.length > 0
		? `ended=${oldSessionId}`
		: "reset without stored session";
}

/**
 * Type a prompt into the terminal, submit it, and wait for the relay ack.
 * When echoNeedle is set, also wait until the terminal echoes that text.
 */
async function typePromptIntoTerminal({
	page,
	prompt,
	echoNeedle,
}: {
	page: Page;
	prompt: string;
	echoNeedle?: string;
}) {
	const helperTextarea = page.locator("#agent-terminal .xterm-helper-textarea");
	await helperTextarea.waitFor({ state: "attached", timeout: 10_000 });
	await helperTextarea.click();
	await helperTextarea.focus();
	await page.keyboard.type(prompt, { delay: 1 });
	await page.waitForTimeout(750);
	await page.keyboard.press("Enter");
	await waitForRelayInputAck({ page });
	if (echoNeedle && echoNeedle.length > 0) {
		await page.waitForFunction(
			(needle) => {
				const text =
					document.querySelector("#agent-terminal")?.textContent || "";
				return text.includes(needle);
			},
			echoNeedle,
			{ timeout: 15_000 }
		);
	}
}

/** Wait until the given filename appears in the artifacts pane. */
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
			const text =
				document.querySelector("#agent-artifacts")?.textContent || "";
			return text.includes(expectedFilename);
		},
		filename,
		{ timeout: timeoutMs }
	);
}

/** Return the `data-path` of every artifact tile in the artifacts pane. */
async function readArtifactPaths({ page }: { page: Page }): Promise<string[]> {
	return page.evaluate(() =>
		Array.from(document.querySelectorAll("#agent-artifacts .sandbox-file-tile"))
			.map((element) => element.getAttribute("data-path") || "")
			.filter((value) => value.length > 0)
	);
}

/** Wait for an image artifact whose filename starts with namePrefix, returning that filename. */
async function waitForImageArtifact({
	page,
	namePrefix,
	timeoutMs,
}: {
	page: Page;
	namePrefix: string;
	timeoutMs: number;
}): Promise<string> {
	await page.waitForFunction(
		({ expectedPrefix }) =>
			Array.from(
				document.querySelectorAll("#agent-artifacts .sandbox-file-tile")
			).some((element) => {
				const path = element.getAttribute("data-path") || "";
				const filename = path.split("/").pop() || "";
				return (
					filename.startsWith(expectedPrefix) &&
					/\.(jpe?g|png|webp)$/i.test(filename)
				);
			}),
		{ expectedPrefix: namePrefix },
		{ timeout: timeoutMs }
	);
	const paths = await readArtifactPaths({ page });
	const match = paths
		.map((path) => basename(path))
		.find(
			(filename) =>
				filename.startsWith(namePrefix) && /\.(jpe?g|png|webp)$/i.test(filename)
		);
	if (!match) {
		throw new Error(`missing image artifact with prefix ${namePrefix}`);
	}
	return match;
}

/** Click an artifact row's download button and save the file under outDir. */
async function downloadArtifactWithButton({
	page,
	filename,
	outDir,
}: {
	page: Page;
	filename: string;
	outDir: string;
}): Promise<string> {
	const row = page.locator("#agent-artifacts .sandbox-file-tile", {
		hasText: filename,
	});
	const button = row.getByRole("button", { name: /Download file/ });
	const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
	await button.click();
	const download = await downloadPromise;
	const targetPath = join(outDir, `downloaded-${basename(filename)}`);
	await download.saveAs(targetPath);
	return targetPath;
}

/** Fetch an artifact's text content via the session's download API from the page context. */
async function fetchArtifactTextFromPage({
	page,
	filename,
	licenseServerUrl,
}: {
	page: Page;
	filename: string;
	licenseServerUrl: string;
}): Promise<string> {
	return page.evaluate(
		async ({ artifactFilename, fallbackApiBase }) => {
			const apiBase = window.PaymentAPI?.getApiBaseUrl?.() || fallbackApiBase;
			const token = window.PaymentAPI?.getAuthToken?.() || "";
			const sessionId =
				window.localStorage.getItem("qcut_agent_session_id") || "";
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
		},
		{ artifactFilename: filename, fallbackApiBase: licenseServerUrl }
	);
}

/** Click disconnect and wait until the terminal status becomes "disconnected". */
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

/**
 * Entry point: parse CLI args, drive the full chat-agent E2E flow through its
 * steps, write results/screenshots to the out dir, and exit non-zero on failure.
 */
async function main() {
	const config = parseArgs({ argv: process.argv.slice(2) });
	mkdirSync(config.outDir, { recursive: true });

	const runId = String(Date.now());
	const browser = await chromium.launch({ headless: !config.headed });
	const page = await browser.newPage({
		acceptDownloads: true,
		viewport: { width: 1180, height: 920 },
	});
	await page.addInitScript(() => {
		window.localStorage.removeItem("qcut_agent_session_id");
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

		if (config.resetSessionBeforeConnect) {
			await runStep({
				state,
				name: "reset active server session before terminal test",
				screenshotName: "03-reset-active-session",
				action: async () =>
					resetServerSessionThroughUi({
						page,
						timeoutMs: config.connectTimeoutMs,
					}),
			});
		}

		await runStep({
			state,
			name: "manual connect opens Codex",
			screenshotName: "04-connect-codex-ready",
			action: async () => {
				await page.locator("#agent-terminal-connect").click();
				await waitForCodexReady({
					page,
					timeoutMs: config.connectTimeoutMs,
				});
				return "Codex ready in Daytona PTY";
			},
		});

		if (config.terminalPrompt.length > 0) {
			await runStep({
				state,
				name: "custom terminal prompt creates expected artifacts",
				screenshotName: "05-custom-terminal-prompt",
				action: async () => {
					await typePromptIntoTerminal({
						page,
						prompt: config.terminalPrompt,
						echoNeedle:
							config.terminalPromptEchoNeedle ||
							config.expectedArtifacts[0] ||
							"",
					});
					for (const filename of config.expectedArtifacts) {
						await waitForArtifact({
							page,
							filename,
							timeoutMs: config.artifactTimeoutMs,
						});
					}
					for (const expectation of config.expectedArtifactText) {
						await waitForArtifact({
							page,
							filename: expectation.filename,
							timeoutMs: config.artifactTimeoutMs,
						});
						const fetchedText = await fetchArtifactTextFromPage({
							page,
							filename: expectation.filename,
							licenseServerUrl: config.licenseServerUrl,
						});
						assertCondition({
							condition: fetchedText.includes(expectation.contains),
							message: `${expectation.filename} did not contain ${expectation.contains}`,
						});
					}
					const debugText = await readTerminalDebug({ page });
					assertCondition({
						condition: /ack #\d+ \d+ bytes/.test(debugText),
						message: `expected relay ack after custom prompt, got ${debugText}`,
					});
					assertCondition({
						condition: !debugText.includes("no relay ack"),
						message: `unexpected stale ack warning after custom prompt: ${debugText}`,
					});
					return `artifacts=${config.expectedArtifacts.join(",")}; debug=${debugText}`;
				},
			});
		} else {
			const artifactFilename = `terminal-image-e2e-${runId}.txt`;
			const artifactText = `qcut image generated ${runId}`;
			const imageNamePrefix = `terminal-image-e2e-${runId}`;
			let imageFilename = "";
			await runStep({
				state,
				name: "direct terminal qcut image generation creates artifacts",
				screenshotName: "05-artifact-visible",
				action: async () => {
					await typePromptIntoTerminal({
						page,
						prompt: `Run qcut CLI image generation in the sandbox: qcut gen image -t "e2e ${runId} small blue square icon on a clean white background" --json -o /tmp/qcut-output. After it succeeds, copy one generated image to /tmp/qcut-output/${imageNamePrefix} with the same image extension, write "${artifactText}" into /tmp/qcut-output/${artifactFilename}, and reply with IMAGE_DONE_${runId} plus the artifact paths.`,
						echoNeedle: imageNamePrefix,
					});
					await waitForArtifact({
						page,
						filename: artifactFilename,
						timeoutMs: config.artifactTimeoutMs,
					});
					imageFilename = await waitForImageArtifact({
						page,
						namePrefix: imageNamePrefix,
						timeoutMs: config.artifactTimeoutMs,
					});
					const debugText = await readTerminalDebug({ page });
					assertCondition({
						condition: /ack #\d+ \d+ bytes/.test(debugText),
						message: `expected relay ack after image prompt, got ${debugText}`,
					});
					assertCondition({
						condition: !debugText.includes("no relay ack"),
						message: `unexpected stale ack warning after image prompt: ${debugText}`,
					});
					return `marker=${artifactFilename}; image=${imageFilename}; debug=${debugText}`;
				},
			});

			const secondArtifactFilename = `terminal-second-input-e2e-${runId}.txt`;
			const secondArtifactText = `second input ok ${runId}`;
			await runStep({
				state,
				name: "second terminal input works after image generation",
				screenshotName: "06-second-input-after-image",
				action: async () => {
					await typePromptIntoTerminal({
						page,
						prompt: `This is the second input after image generation. Write "${secondArtifactText}" into /tmp/qcut-output/${secondArtifactFilename}, then reply SECOND_INPUT_DONE_${runId}.`,
						echoNeedle: secondArtifactFilename,
					});
					await waitForArtifact({
						page,
						filename: secondArtifactFilename,
						timeoutMs: config.promptTimeoutMs,
					});
					const fetchedText = await fetchArtifactTextFromPage({
						page,
						filename: secondArtifactFilename,
						licenseServerUrl: config.licenseServerUrl,
					});
					assertCondition({
						condition: fetchedText.trim() === secondArtifactText,
						message: `second input artifact mismatch: ${fetchedText.trim()}`,
					});
					const debugText = await readTerminalDebug({ page });
					assertCondition({
						condition: !debugText.includes("no relay ack"),
						message: `unexpected stale ack warning after second input: ${debugText}`,
					});
					return `second=${secondArtifactFilename}; debug=${debugText}`;
				},
			});

			await runStep({
				state,
				name: "terminal-generated image artifacts download from the web UI",
				screenshotName: "07-artifact-download",
				action: async () => {
					const downloadedMarkerPath = await downloadArtifactWithButton({
						page,
						filename: artifactFilename,
						outDir: config.outDir,
					});
					const downloadedImagePath = await downloadArtifactWithButton({
						page,
						filename: imageFilename,
						outDir: config.outDir,
					});
					const fetchedText = await fetchArtifactTextFromPage({
						page,
						filename: artifactFilename,
						licenseServerUrl: config.licenseServerUrl,
					});
					assertCondition({
						condition: fetchedText.trim() === artifactText,
						message: `artifact content mismatch: ${fetchedText.trim()}`,
					});
					return `downloaded=${downloadedMarkerPath}; image=${downloadedImagePath}`;
				},
			});

			await runStep({
				state,
				name: "reconnect opens Codex again",
				screenshotName: "08-reconnect-codex-ready",
				action: async () => {
					const beforeSessionId = await readStoredAgentSessionId({ page });
					await page.locator("#agent-terminal-reconnect").click();
					await waitForCodexReady({
						page,
						timeoutMs: config.connectTimeoutMs,
					});
					const afterSessionId = await readStoredAgentSessionId({ page });
					assertCondition({
						condition:
							beforeSessionId.length > 0 && beforeSessionId === afterSessionId,
						message: `reconnect changed session ${beforeSessionId} -> ${afterSessionId}`,
					});
					return `sameSession=${afterSessionId}`;
				},
			});

			const reconnectArtifactFilename = `terminal-reconnect-e2e-${runId}.txt`;
			const reconnectArtifactText = `reconnect input ok ${runId}`;
			await runStep({
				state,
				name: "input works after explicit reconnect",
				screenshotName: "09-input-after-reconnect",
				action: async () => {
					await typePromptIntoTerminal({
						page,
						prompt: `After explicit Reconnect, write "${reconnectArtifactText}" into /tmp/qcut-output/${reconnectArtifactFilename}, then reply RECONNECT_INPUT_DONE_${runId}.`,
						echoNeedle: reconnectArtifactFilename,
					});
					await waitForArtifact({
						page,
						filename: reconnectArtifactFilename,
						timeoutMs: config.promptTimeoutMs,
					});
					const fetchedText = await fetchArtifactTextFromPage({
						page,
						filename: reconnectArtifactFilename,
						licenseServerUrl: config.licenseServerUrl,
					});
					assertCondition({
						condition: fetchedText.trim() === reconnectArtifactText,
						message: `reconnect artifact mismatch: ${fetchedText.trim()}`,
					});
					const debugText = await readTerminalDebug({ page });
					assertCondition({
						condition: !debugText.includes("no relay ack"),
						message: `unexpected stale ack warning after reconnect input: ${debugText}`,
					});
					return `reconnect=${reconnectArtifactFilename}; debug=${debugText}`;
				},
			});
		}

		await runStep({
			state,
			name: "disconnect clears terminal state",
			screenshotName: "10-disconnected-clean",
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
