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
const POLL_INTERVAL_MS = 15_000;

declare global {
	interface Window {
		AgentChatAPI?: {
			clearStoredAgentSessionId?: () => void;
			createAgentSession?: () => Promise<{ id?: string } | null>;
			endAgentSession?: ({
				sessionId,
			}: {
				sessionId: string;
			}) => Promise<unknown>;
		};
		AgentChatReady?: Promise<unknown>;
		PaymentAPI?: {
			getApiBaseUrl?: () => string;
			getAuthToken?: () => string;
		};
	}
}

type Config = {
	url: string;
	licenseServerUrl: string;
	outDir: string;
	diagnosticOnly: boolean;
	headed: boolean;
	injectLocalAgentChatJs: boolean;
	connectTimeoutMs: number;
	generationTimeoutMs: number;
	secondInputTimeoutMs: number;
	resetSessionBeforeConnect: boolean;
};

type SessionContext = {
	apiBase: string;
	sessionId: string;
	token: string;
};

type StepStatus = "passed" | "failed";

type StepResult = {
	name: string;
	status: StepStatus;
	durationMs: number;
	detail?: string;
	screenshot?: string;
};

type RunState = {
	browser: Browser;
	page: Page;
	config: Config;
	runId: string;
	root: string;
	steps: StepResult[];
	downloads: DownloadedImage[];
};

type DimensionValidation = {
	status: string;
	results: Array<{
		name: string;
		filePath: string;
		width: number;
		height: number;
		ratio: number;
		ok: boolean;
	}>;
	failed: Array<unknown>;
};

type DownloadedImage = {
	name: string;
	remotePath: string;
	localPath: string;
	width: number;
	height: number;
	ratio: number;
};

const EXPECTED_IMAGE_DIMENSIONS: Record<
	string,
	{ width: number; height: number }
> = {
	"aspect-16-9": { width: 2048, height: 1152 },
	"ratio-9-16": { width: 1152, height: 2048 },
	"aspect-3-4": { width: 1536, height: 2048 },
	"aspect-4-3": { width: 2048, height: 1536 },
	"custom-2000x1152": { width: 2000, height: 1152 },
};

function readOption({ argv, name }: { argv: string[]; name: string }): string {
	const index = argv.indexOf(name);
	if (index === -1) return "";
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
	if (raw.length === 0) return defaultValue;
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
		`agent-chat-image-ratio-size-e2e-${timestamp}`
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
		diagnosticOnly: hasFlag({ argv, name: "--diagnostic-only" }),
		headed:
			hasFlag({ argv, name: "--headed" }) ||
			hasFlag({ argv, name: "--headful" }),
		injectLocalAgentChatJs: hasFlag({
			argv,
			name: "--inject-local-agent-chat-js",
		}),
		connectTimeoutMs: readNumberOption({
			argv,
			name: "--connect-timeout-ms",
			defaultValue: 240_000,
		}),
		generationTimeoutMs: readNumberOption({
			argv,
			name: "--generation-timeout-ms",
			defaultValue: 1_800_000,
		}),
		secondInputTimeoutMs: readNumberOption({
			argv,
			name: "--second-input-timeout-ms",
			defaultValue: 240_000,
		}),
		resetSessionBeforeConnect: !hasFlag({
			argv,
			name: "--skip-session-reset",
		}),
	};
}

function printHelp() {
	console.log(`QCut Image Ratio/Size Chat Agent E2E

Usage:
  bun scripts/agent-chat-image-ratio-size-e2e.ts [options]

Options:
  --url <url>                         Chat Agent URL. Default: ${DEFAULT_URL}
  --license-server-url <url>          License server base URL fallback.
  --out-dir <path>                    Screenshot/result output directory.
  --diagnostic-only                   Run a one-image live provider diagnostic.
  --headed, --headful                 Show the browser.
  --inject-local-agent-chat-js        Route js/agent-chat.js to the local file.
  --connect-timeout-ms <ms>           Connect/Codex ready timeout.
  --generation-timeout-ms <ms>        First natural-language request timeout.
  --second-input-timeout-ms <ms>      Second natural-language request timeout.
  --skip-session-reset                Reuse the current active server-side session.
`);
}

function log({ message }: { message: string }) {
	console.log(`[agent-chat-image-ratio-size-e2e] ${message}`);
}

function assertCondition({
	condition,
	message,
}: {
	condition: boolean;
	message: string;
}) {
	if (!condition) throw new Error(message);
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
	const startedAt = Date.now();
	try {
		const detail = await action();
		const image = await screenshot({
			page: state.page,
			outDir: state.config.outDir,
			name: screenshotName,
		});
		const durationMs = Date.now() - startedAt;
		state.steps.push({
			name,
			status: "passed",
			durationMs,
			detail,
			screenshot: image,
		});
		log({ message: `PASS ${name} (${durationMs}ms)` });
	} catch (error) {
		const image = await screenshot({
			page: state.page,
			outDir: state.config.outDir,
			name: `${screenshotName}-failed`,
		});
		const durationMs = Date.now() - startedAt;
		const detail = error instanceof Error ? error.message : String(error);
		state.steps.push({
			name,
			status: "failed",
			durationMs,
			detail,
			screenshot: image,
		});
		throw error;
	}
}

async function setupLocalJsRoute({
	page,
	enabled,
}: {
	page: Page;
	enabled: boolean;
}) {
	if (!enabled) return;
	const source = readFileSync(LOCAL_AGENT_CHAT_JS, "utf8");
	await page.route("**/js/agent-chat.js", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/javascript",
			body: source,
		});
	});
}

async function readTerminalStatus({ page }: { page: Page }): Promise<string> {
	return (
		await page.locator("#agent-terminal-status").innerText({ timeout: 5_000 })
	).trim();
}

async function readTerminalText({ page }: { page: Page }): Promise<string> {
	try {
		return await page.locator("#agent-terminal").innerText({ timeout: 2_000 });
	} catch {
		return "";
	}
}

async function waitForAgentChatReady({ page }: { page: Page }) {
	await page.waitForFunction(
		() => {
			const ready = window.AgentChatReady;
			return Boolean(ready && typeof ready.then === "function");
		},
		null,
		{ timeout: 30_000 }
	);
	await page.evaluate(() => window.AgentChatReady);
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
			return (
				status === "connected" &&
				terminalText.includes("OpenAI Codex") &&
				terminalText.includes("gpt-5.5 default")
			);
		},
		null,
		{ timeout: timeoutMs }
	);
}

async function resetServerSessionThroughUi({
	page,
}: {
	page: Page;
	timeoutMs: number;
}) {
	await page.waitForTimeout(2_000);
	const endedSessionId = await page.evaluate(async () => {
		const api = window.AgentChatAPI;
		if (!api?.createAgentSession || !api?.endAgentSession) return "";
		try {
			const session = await api.createAgentSession();
			const sessionId = typeof session?.id === "string" ? session.id : "";
			if (sessionId.length > 0) {
				await api.endAgentSession({ sessionId });
			}
			api.clearStoredAgentSessionId?.();
			return sessionId;
		} catch {
			api.clearStoredAgentSessionId?.();
			return "";
		}
	});
	await page.locator("#agent-new-session").click();
	await page.waitForFunction(
		() => {
			const status = document
				.querySelector("#agent-terminal-status")
				?.textContent?.trim();
			const sessionId =
				window.localStorage.getItem("qcut_agent_session_id") || "";
			const text =
				document.querySelector("#agent-session-status")?.textContent?.trim() || "";
			return (
				status === "disconnected" &&
				sessionId.length === 0 &&
				(text === "none" || text.length === 0)
			);
		},
		null,
		{ timeout: 60_000 }
	);
	return endedSessionId.length > 0
		? `ended active session=${endedSessionId}`
		: "confirmed no active session";
}

async function typePromptIntoTerminal({
	page,
	prompt,
}: {
	page: Page;
	prompt: string;
}) {
	const terminal = page.locator("#agent-terminal");
	const helperTextarea = page.locator(
		"#agent-terminal .xterm-helper-textarea"
	);
	await helperTextarea.waitFor({ state: "attached", timeout: 10_000 });
	await terminal.click({ position: { x: 260, y: 420 } });
	await helperTextarea.focus();
	await page.keyboard.type(prompt, { delay: 1 });
	await page.waitForTimeout(750);
	await page.keyboard.press("Control+M");
}

async function getSessionContext({
	page,
	fallbackApiBase,
}: {
	page: Page;
	fallbackApiBase: string;
}): Promise<SessionContext> {
	return page.evaluate((apiBaseFallback) => {
		const apiBase = window.PaymentAPI?.getApiBaseUrl?.() || apiBaseFallback;
		const token = window.PaymentAPI?.getAuthToken?.() || "";
		const sessionId = window.localStorage.getItem("qcut_agent_session_id") || "";
		if (sessionId.length === 0) {
			throw new Error("missing agent session id");
		}
		return { apiBase, token, sessionId };
	}, fallbackApiBase);
}

function buildSessionFileUrl({
	context,
	remotePath,
}: {
	context: SessionContext;
	remotePath: string;
}): string {
	return `${context.apiBase}/api/agent/sessions/${encodeURIComponent(
		context.sessionId
	)}/files/download?path=${encodeURIComponent(remotePath)}`;
}

async function downloadSessionFile({
	context,
	remotePath,
	localPath,
}: {
	context: SessionContext;
	remotePath: string;
	localPath: string;
}): Promise<boolean> {
	const response = await fetch(buildSessionFileUrl({ context, remotePath }), {
		headers:
			context.token.length === 0
				? undefined
				: { Authorization: `Bearer ${context.token}` },
	});
	if (!response.ok) return false;
	const bytes = Buffer.from(await response.arrayBuffer());
	writeFileSync(localPath, bytes);
	return true;
}

async function fetchSessionText({
	context,
	remotePath,
}: {
	context: SessionContext;
	remotePath: string;
}): Promise<string | null> {
	const response = await fetch(buildSessionFileUrl({ context, remotePath }), {
		headers:
			context.token.length === 0
				? undefined
				: { Authorization: `Bearer ${context.token}` },
	});
	if (!response.ok) return null;
	return response.text();
}

async function waitForSessionText({
	context,
	remotePath,
	timeoutMs,
}: {
	context: SessionContext;
	remotePath: string;
	timeoutMs: number;
}): Promise<string> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const text = await fetchSessionText({ context, remotePath });
		if (text !== null) return text;
		await new Promise((resolveDelay) =>
			setTimeout(resolveDelay, POLL_INTERVAL_MS)
		);
	}
	throw new Error(`timed out waiting for ${remotePath}`);
}

async function readLocalImageDimensions({
	localPath,
}: {
	localPath: string;
}): Promise<{ width: number; height: number; ratio: number }> {
	const { loadImage } = await import("@napi-rs/canvas");
	const image = await loadImage(localPath);
	return {
		width: image.width,
		height: image.height,
		ratio: image.width / image.height,
	};
}

function buildGenerationPrompt({ root }: { root: string }): string {
	return `Please run a real QCut image ratio/size E2E in this Daytona sandbox using natural-language instructions from me. Do not mock anything and do not fall back to another model. Use exactly this output root: ${root}. First run preflight: qcut --version, qcut system models --json, and qcut gen image --help; write models.json and gen-image-help.txt under the root; if gpt_image_2_ima, --ratio, --width, or --height is missing, write ${root}/preflight-failed.txt and stop. If preflight passes, run qcut gen image with model fixed to gpt_image_2_ima for these five cases: 1) name aspect-16-9, prompt "minimal product photo of a matte black coffee mug on a neutral table, clean studio lighting" with --aspect-ratio 16:9 into ${root}/aspect-16-9 and expect 2048x1152, 2) name ratio-9-16, prompt "minimal product photo of a matte black coffee mug on a neutral table, vertical poster crop" with --ratio 9:16 into ${root}/ratio-9-16 and expect 1152x2048, 3) name aspect-3-4, prompt "minimal product photo of a matte black coffee mug on a neutral table, portrait editorial crop" with --aspect-ratio 3:4 into ${root}/aspect-3-4 and expect 1536x2048, 4) name aspect-4-3, prompt "minimal product photo of a matte black coffee mug on a neutral table, landscape catalog crop" with --aspect-ratio 4:3 into ${root}/aspect-4-3 and expect 2048x1536, 5) name custom-2000x1152, prompt "wide editorial hero image of a matte black coffee mug on a neutral table, clean studio lighting" with --width 2000 --height 1152 into ${root}/custom-2000x1152 and expect 2000x1152. Use --json and tee each command output to a matching JSON file under the root. After generation, use @napi-rs/canvas or another reliable method to read final image dimensions and write ${root}/dimension-validation.json with status, results, failed, and image file paths. Use the exact case names above in results[].name and mark status SUCCESS only if every image path exists and every dimension exactly matches its expected width and height. Also write ${root}/e2e-summary.md. Final response should include RESULT_READY, the root path, each image path, dimensions, sidecar JSON paths, and whether validation succeeded.`;
}

function buildDiagnosticPrompt({ root }: { root: string }): string {
	return `Please run a real QCut/IMA Router diagnostic in this Daytona sandbox from this natural-language input. Do not print or write any API secret. Use exactly this output root: ${root}. First create the root. Write ${root}/env-check.txt containing only HAS_IMAROUTER_API_KEY=yes/no and IMAROUTER_API_KEY_LENGTH=<number>. Then call IMA Router's user-balance endpoint with the sandbox IMAROUTER_API_KEY and write only the HTTP status code to ${root}/imarouter-balance-status.txt, with no response body and no secret. Then run qcut gen image --model gpt_image_2_ima --text "small neutral product photo of a matte black coffee mug on a table" --width 1024 --height 1024 --output-dir ${root}/default-1024 --json and tee stdout/stderr to ${root}/default-1024.json. Finally write ${root}/diagnostic-ready.txt with DIAGNOSTIC_READY and include whether default-1024.json status is success or error. Reply with DIAGNOSTIC_READY and the root path.`;
}

function buildSecondInputPrompt({ root }: { root: string }): string {
	return `This is the second independent natural-language input in the same Codex terminal / PTY session after the image generation finished. Please run: mkdir -p ${root}; echo "SECOND_INPUT_OK $(date -Iseconds)" > ${root}/second-input-ok.txt; qcut --version | tee ${root}/qcut-version-after-second-input.txt. Then reply with SECOND_INPUT_DONE and the two file paths.`;
}

async function downloadAndVerifyImages({
	state,
	context,
	validation,
}: {
	state: RunState;
	context: SessionContext;
	validation: DimensionValidation;
}) {
	for (const result of validation.results) {
		const localPath = join(
			state.config.outDir,
			`downloaded-${result.name}-${basename(result.filePath)}`
		);
		const downloaded = await downloadSessionFile({
			context,
			remotePath: result.filePath,
			localPath,
		});
		assertCondition({
			condition: downloaded,
			message: `failed to download ${result.filePath}`,
		});
		const dimensions = await readLocalImageDimensions({ localPath });
		state.downloads.push({
			name: result.name,
			remotePath: result.filePath,
			localPath,
			...dimensions,
		});
		assertCondition({
			condition:
				dimensions.width === result.width && dimensions.height === result.height,
			message: `local dimensions mismatch for ${result.name}`,
		});
		const expected = EXPECTED_IMAGE_DIMENSIONS[result.name];
		assertCondition({
			condition: expected !== undefined,
			message: `unexpected validation result name ${result.name}`,
		});
		assertCondition({
			condition:
				dimensions.width === expected.width &&
				dimensions.height === expected.height,
			message: `${result.name} expected ${expected.width}x${expected.height}, got ${dimensions.width}x${dimensions.height}`,
		});
	}
}

async function main() {
	const config = parseArgs({ argv: process.argv.slice(2) });
	mkdirSync(config.outDir, { recursive: true });

	const runId = String(Date.now());
	const root = `/tmp/qcut-output/gen-image-ratio-size-e2e-${runId}`;
	const browser = await chromium.launch({ headless: !config.headed });
	const page = await browser.newPage({
		acceptDownloads: true,
		viewport: { width: 1280, height: 960 },
	});
	await page.addInitScript(() => {
		window.localStorage.removeItem("qcut_agent_session_id");
	});
	const state: RunState = {
		browser,
		page,
		config,
		runId,
		root,
		steps: [],
		downloads: [],
	};

	let exitCode = 0;
	let validation: DimensionValidation | null = null;
	let context: SessionContext | null = null;
	try {
		await setupLocalJsRoute({
			page,
			enabled: config.injectLocalAgentChatJs,
		});

		await runStep({
			state,
			name: "load chat agent page",
			screenshotName: "01-initial-load",
			action: async () => {
				await page.goto(config.url, {
					waitUntil: "domcontentloaded",
					timeout: 60_000,
				});
				await waitForAgentChatReady({ page });
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

		if (config.resetSessionBeforeConnect) {
			await runStep({
				state,
				name: "reset active server session",
				screenshotName: "02-reset-active-session",
				action: async () =>
					resetServerSessionThroughUi({
						page,
						timeoutMs: config.connectTimeoutMs,
					}),
			});
		}

		await runStep({
			state,
			name: "connect to Daytona Codex terminal",
			screenshotName: "03-codex-ready",
			action: async () => {
				await page.locator("#agent-terminal-connect").click();
				await waitForCodexReady({
					page,
					timeoutMs: config.connectTimeoutMs,
				});
				context = await getSessionContext({
					page,
					fallbackApiBase: config.licenseServerUrl,
				});
				log({ message: `session=${context.sessionId}; root=${root}` });
				return `session=${context.sessionId}; root=${root}`;
			},
		});

		await runStep({
			state,
			name: "natural language request generates ratio and size images",
			screenshotName: "04-generation-request-submitted",
			action: async () => {
				if (!context) throw new Error("missing session context");
				if (config.diagnosticOnly) {
					await typePromptIntoTerminal({
						page,
						prompt: buildDiagnosticPrompt({ root }),
					});
					const readyText = await waitForSessionText({
						context,
						remotePath: `${root}/diagnostic-ready.txt`,
						timeoutMs: config.generationTimeoutMs,
					});
					const files = [
						"env-check.txt",
						"imarouter-balance-status.txt",
						"default-1024.json",
						"diagnostic-ready.txt",
					];
					for (const file of files) {
						const text = await fetchSessionText({
							context,
							remotePath: `${root}/${file}`,
						});
						if (text !== null) {
							writeFileSync(join(config.outDir, file), text);
						}
					}
					return readyText.trim();
				}
				await typePromptIntoTerminal({
					page,
					prompt: buildGenerationPrompt({ root }),
				});
				const preflightText = await fetchSessionText({
					context,
					remotePath: `${root}/preflight-failed.txt`,
				});
				if (preflightText !== null) {
					throw new Error(`preflight failed: ${preflightText}`);
				}
				const validationText = await waitForSessionText({
					context,
					remotePath: `${root}/dimension-validation.json`,
					timeoutMs: config.generationTimeoutMs,
				});
				writeFileSync(
					join(config.outDir, "dimension-validation.json"),
					validationText
				);
				validation = JSON.parse(validationText) as DimensionValidation;
				assertCondition({
					condition: validation.status === "SUCCESS",
					message: `dimension validation status=${validation.status}`,
				});
				assertCondition({
					condition: validation.failed.length === 0,
					message: "dimension validation has failures",
				});
				return `validation=${validation.status}; cases=${validation.results.length}`;
			},
		});

		if (config.diagnosticOnly) {
			return;
		}

		await runStep({
			state,
			name: "download generated images and verify local dimensions",
			screenshotName: "05-images-downloaded",
			action: async () => {
				if (!context) throw new Error("missing session context");
				if (!validation) throw new Error("missing validation result");
				await downloadAndVerifyImages({ state, context, validation });
				return state.downloads
					.map((item) => `${item.name}=${item.width}x${item.height}`)
					.join(", ");
			},
		});

		await runStep({
			state,
			name: "second natural language input works in same terminal",
			screenshotName: "06-second-input",
			action: async () => {
				if (!context) throw new Error("missing session context");
				await typePromptIntoTerminal({
					page,
					prompt: buildSecondInputPrompt({ root }),
				});
				const secondInputText = await waitForSessionText({
					context,
					remotePath: `${root}/second-input-ok.txt`,
					timeoutMs: config.secondInputTimeoutMs,
				});
				const versionText = await waitForSessionText({
					context,
					remotePath: `${root}/qcut-version-after-second-input.txt`,
					timeoutMs: config.secondInputTimeoutMs,
				});
				writeFileSync(join(config.outDir, "second-input-ok.txt"), secondInputText);
				writeFileSync(
					join(config.outDir, "qcut-version-after-second-input.txt"),
					versionText
				);
				assertCondition({
					condition: secondInputText.includes("SECOND_INPUT_OK"),
					message: "second input marker missing",
				});
				assertCondition({
					condition: versionText.trim().length > 0,
					message: "qcut version output missing",
				});
				return `${secondInputText.trim()}; version=${versionText.trim()}`;
			},
		});

		await runStep({
			state,
			name: "final browser screenshot captures working terminal",
			screenshotName: "07-final-proof",
			action: async () => {
				const terminalText = await readTerminalText({ page });
				return terminalText.includes("SECOND_INPUT_DONE")
					? "terminal shows second input completion"
					: "terminal screenshot captured";
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
		writeFileSync(
			resultPath,
			`${JSON.stringify(
				{
					status: exitCode === 0 ? "passed" : "failed",
					runId,
					url: config.url,
					root,
					diagnosticOnly: config.diagnosticOnly,
					injectLocalAgentChatJs: config.injectLocalAgentChatJs,
					outDir: config.outDir,
					steps: state.steps,
					validation,
					downloads: state.downloads,
				},
				null,
				2
			)}\n`
		);
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
