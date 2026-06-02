#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const DEFAULT_URL = "https://quriosity.com.au/chat-agent.html";
const DEFAULT_LICENSE_SERVER_URL =
	"https://qcut-license-server.zdhpeter.workers.dev";
const POLL_INTERVAL_MS = 15_000;
const SESSION_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_REFERENCE_IMAGE_URL =
	"https://storage.googleapis.com/gmi-video-assests-prod/user-assets/3e51f140-4e66-4cb2-bca4-6f412e5d6113/780402b5-bbc0-4941-b029-a4ce0cdab845/gmi-videogen/generated/source_image_c4046b99-7fad-4e4d-b681-fef11bd431e3579b9b15-2a03-45a3-94e5-42fa4a8ab5a4.png";

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
	referenceImageUrl: string;
	useLocalReferenceFile: boolean;
	headed: boolean;
	connectTimeoutMs: number;
	generationTimeoutMs: number;
};

type SessionContext = {
	apiBase: string;
	sessionId: string;
	token: string;
};

type StepResult = {
	name: string;
	status: "passed" | "failed";
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
	downloads: Array<{ remotePath: string; localPath: string }>;
};

/** Read the value following a named CLI flag, or "" when the flag is absent. */
function readOption({ argv, name }: { argv: string[]; name: string }): string {
	const index = argv.indexOf(name);
	if (index === -1) return "";
	return argv[index + 1] || "";
}

/** Return true when a boolean CLI flag is present in argv. */
function hasFlag({ argv, name }: { argv: string[]; name: string }): boolean {
	return argv.includes(name);
}

/** Parse a numeric CLI option, falling back to defaultValue when missing or non-positive. */
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

/** Build the run Config from argv, env-var fallbacks, and defaults (exits on --help). */
function parseArgs({ argv }: { argv: string[] }): Config {
	if (hasFlag({ argv, name: "--help" }) || hasFlag({ argv, name: "-h" })) {
		printHelp();
		process.exit(0);
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const defaultOutDir = join(
		process.cwd(),
		"output/playwright",
		`agent-chat-imarouter-ref2v-e2e-${timestamp}`
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
		referenceImageUrl:
			readOption({ argv, name: "--reference-image-url" }) ||
			process.env.IMAROUTER_REF2V_E2E_REFERENCE_IMAGE_URL ||
			DEFAULT_REFERENCE_IMAGE_URL,
		useLocalReferenceFile: hasFlag({ argv, name: "--local-reference-file" }),
		headed:
			hasFlag({ argv, name: "--headed" }) ||
			hasFlag({ argv, name: "--headful" }),
		connectTimeoutMs: readNumberOption({
			argv,
			name: "--connect-timeout-ms",
			defaultValue: 300_000,
		}),
		generationTimeoutMs: readNumberOption({
			argv,
			name: "--generation-timeout-ms",
			defaultValue: 1_800_000,
		}),
	};
}

/** Print CLI usage and the supported options to stdout. */
function printHelp() {
	console.log(`QCut IMA Router Ref2V Chat Agent E2E

Usage:
  bun scripts/agent-chat-imarouter-ref2v-e2e.ts [options]

Options:
  --url <url>                         Chat Agent URL. Default: ${DEFAULT_URL}
  --license-server-url <url>          License server base URL fallback.
  --out-dir <path>                    Screenshot/result output directory.
  --reference-image-url <url>         Public image URL to pass via --reference-images.
  --local-reference-file              Download the reference URL in the sandbox, then pass the local file path.
  --headed, --headful                 Show the browser.
  --connect-timeout-ms <ms>           Connect/Codex ready timeout.
  --generation-timeout-ms <ms>        Ref2V generation timeout.
`);
}

/** Write a namespaced progress line to stdout. */
function log({ message }: { message: string }) {
	console.log(`[agent-chat-imarouter-ref2v-e2e] ${message}`);
}

/** Throw an Error with the given message when condition is false. */
function assertCondition({
	condition,
	message,
}: {
	condition: boolean;
	message: string;
}) {
	if (!condition) throw new Error(message);
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

/**
 * Run a named step: execute its action, capture a screenshot, and record a
 * passed/failed StepResult with timing. Re-throws after recording on failure.
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

/** Wait until the page's `window.AgentChatReady` promise resolves (30s cap). */
async function waitForAgentChatReady({ page }: { page: Page }) {
	await page.waitForFunction(
		async () => {
			const ready = window.AgentChatReady;
			if (!ready || typeof ready.then !== "function") return false;
			await ready;
			return true;
		},
		null,
		{ timeout: 30_000 }
	);
}

/** Read the trimmed text of the `#agent-terminal-status` element. */
async function readTerminalStatus({ page }: { page: Page }): Promise<string> {
	return (
		await page.locator("#agent-terminal-status").innerText({ timeout: 5_000 })
	).trim();
}

/** Read the terminal's inner text, returning "" if it isn't available yet. */
async function readTerminalText({ page }: { page: Page }): Promise<string> {
	try {
		return await page.locator("#agent-terminal").innerText({ timeout: 2_000 });
	} catch {
		return "";
	}
}

/** Wait until the terminal reports `connected` and shows the Codex banner. */
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

/**
 * Tear down any lingering server session via the page API and the "new
 * session" button, then wait for a clean disconnected state. Returns a
 * human-readable summary of what was reset.
 */
async function resetServerSessionThroughUi({ page }: { page: Page }) {
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
				document.querySelector("#agent-session-status")?.textContent?.trim() ||
				"";
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

/** Focus the xterm helper textarea, type the prompt, and submit it (Ctrl+M). */
async function typePromptIntoTerminal({
	page,
	prompt,
}: {
	page: Page;
	prompt: string;
}) {
	const terminal = page.locator("#agent-terminal");
	const helperTextarea = page.locator("#agent-terminal .xterm-helper-textarea");
	await helperTextarea.waitFor({ state: "attached", timeout: 10_000 });
	await terminal.click();
	await helperTextarea.focus();
	await page.keyboard.type(prompt, { delay: 1 });
	await page.waitForTimeout(750);
	await page.keyboard.press("Control+M");
}

/**
 * Read the active session's API base, auth token, and session id from the
 * page. Throws when no agent session id is present in localStorage.
 */
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
		const sessionId =
			window.localStorage.getItem("qcut_agent_session_id") || "";
		if (sessionId.length === 0) {
			throw new Error("missing agent session id");
		}
		return { apiBase, token, sessionId };
	}, fallbackApiBase);
}

/** Build the session file-download URL for a given remote path. */
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

/**
 * Fetch a session file as text, returning null on a non-OK response. The
 * request is bounded by SESSION_FETCH_TIMEOUT_MS so a stall can't hang polling.
 */
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
		signal: AbortSignal.timeout(SESSION_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) return null;
	return response.text();
}

/**
 * Download a session file to localPath, returning false on a non-OK response.
 * The request is bounded by SESSION_FETCH_TIMEOUT_MS to avoid hanging downloads.
 */
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
		signal: AbortSignal.timeout(SESSION_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) return false;
	const bytes = Buffer.from(await response.arrayBuffer());
	writeFileSync(localPath, bytes);
	return true;
}

/**
 * Poll the sandbox for Ref2V completion markers until ready or timeout.
 * Throws on preflight/generation failure markers; returns the ready-file text.
 */
async function waitForRef2VReady({
	context,
	root,
	timeoutMs,
}: {
	context: SessionContext;
	root: string;
	timeoutMs: number;
}): Promise<string> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const preflightFailure = await fetchSessionText({
			context,
			remotePath: `${root}/preflight-failed.txt`,
		});
		if (preflightFailure !== null) {
			throw new Error(`preflight failed: ${preflightFailure}`);
		}
		const generationFailure = await fetchSessionText({
			context,
			remotePath: `${root}/ref2v-failed.txt`,
		});
		if (generationFailure !== null) {
			throw new Error(`ref2v failed: ${generationFailure}`);
		}
		const readyText = await fetchSessionText({
			context,
			remotePath: `${root}/ref2v-ready.txt`,
		});
		if (readyText !== null) return readyText;
		await new Promise((resolveDelay) =>
			setTimeout(resolveDelay, POLL_INTERVAL_MS)
		);
	}
	throw new Error(`timed out waiting for ${root}/ref2v-ready.txt`);
}

/**
 * Wrap a value in single quotes for safe embedding in the generated shell
 * script, escaping embedded single quotes via the `'\''` idiom.
 */
function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the natural-language prompt that instructs the sandbox agent to run
 * the real IMA Router Ref2V smoke-test shell script and report REF2V_READY.
 */
function buildGenerationPrompt({
	root,
	referenceImageUrl,
	useLocalReferenceFile,
}: {
	root: string;
	referenceImageUrl: string;
	useLocalReferenceFile: boolean;
}): string {
	const referenceInput = useLocalReferenceFile ? "$ROOT/reference.png" : "$REF";
	const localReferenceSetup = useLocalReferenceFile
		? `curl -fsSL "$REF" -o "$ROOT/reference.png"
REFERENCE_INPUT="$ROOT/reference.png"`
		: `REFERENCE_INPUT="$REF"`;
	return `Please run a real online QCut IMA Router Ref2V smoke test in this Daytona sandbox. Do not mock anything, do not use a different model, and do not print or write any API secret.

Run this exact shell script as-is:

cat > /tmp/qcut-imarouter-ref2v-e2e.sh <<'SH'
set -u

ROOT="${root}"
REF=${shellQuote(referenceImageUrl)}
mkdir -p "$ROOT/generated"
${localReferenceSetup}

{
  if [ -n "\${IMAROUTER_API_KEY:-}" ]; then
    echo "HAS_IMAROUTER_API_KEY=yes"
    echo "IMAROUTER_API_KEY_LENGTH=\${#IMAROUTER_API_KEY}"
  else
    echo "HAS_IMAROUTER_API_KEY=no"
    echo "IMAROUTER_API_KEY_LENGTH=0"
  fi
  printf "QCut_VERSION="
  qcut --version || true
  printf "Codex_VERSION="
  codex --version || true
} > "$ROOT/env-check.txt"

qcut system models --json > "$ROOT/models.json" 2> "$ROOT/models.stderr" || true

set +e
QCUT_OUTPUT_DIR="$ROOT/generated" qcut gen video \
  -m imarouter_seedance_2_0_ref2v \
  --reference-images "${referenceInput}" \
  -t "5 second video using the reference image, clean product turntable shot" \
  -d 5s \
  --aspect-ratio 16:9 \
  --resolution 720p \
  --json > "$ROOT/ref2v-command.log" 2>&1
status=$?
set -e

video_path="$(find "$ROOT/generated" -type f -name '*.mp4' | head -n 1)"
sidecar_path="$(find "$ROOT/generated" -type f -name '*.json' | head -n 1)"

if [ -z "$video_path" ]; then
  {
    echo "exit_status=$status"
    cat "$ROOT/ref2v-command.log"
  } > "$ROOT/ref2v-failed.txt"
  exit 0
fi

ffprobe -v error -show_streams -show_format -of json "$video_path" > "$ROOT/ffprobe.json"

python3 - "$ROOT/ref2v-result.json" "$REF" "$REFERENCE_INPUT" "$video_path" "$sidecar_path" "$ROOT/ffprobe.json" <<'PY'
import json
import sys

out, ref, reference_input, video, sidecar, ffprobe = sys.argv[1:]
with open(out, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "status": "SUCCESS",
            "model": "imarouter_seedance_2_0_ref2v",
            "referenceImageUrl": ref,
            "referenceInput": reference_input,
            "videoPath": video,
            "sidecarPath": sidecar,
            "ffprobePath": ffprobe,
        },
        handle,
        indent=2,
    )
    handle.write("\\n")
PY

{
  echo "REF2V_READY"
  echo "videoPath=$video_path"
} > "$ROOT/ref2v-ready.txt"
SH

bash /tmp/qcut-imarouter-ref2v-e2e.sh

After the script finishes, reply with REF2V_READY and the root path: ${root}.

Final response should include REF2V_READY and the root path.`;
}

/**
 * Download each remote evidence path into the run's output directory and
 * record successful downloads on the run state.
 */
async function downloadEvidenceFiles({
	state,
	context,
	remotePaths,
}: {
	state: RunState;
	context: SessionContext;
	remotePaths: string[];
}) {
	for (const remotePath of remotePaths) {
		const localPath = join(state.config.outDir, basename(remotePath));
		const downloaded = await downloadSessionFile({
			context,
			remotePath,
			localPath,
		});
		if (downloaded) {
			state.downloads.push({ remotePath, localPath });
		}
	}
}

/**
 * Orchestrate the full E2E run: launch the browser, reset and connect a
 * session, drive the Ref2V generation, download evidence, write result.json,
 * and exit with a status code reflecting success or failure.
 */
async function main() {
	const config = parseArgs({ argv: process.argv.slice(2) });
	mkdirSync(config.outDir, { recursive: true });

	const runId = String(Date.now());
	const root = `/tmp/qcut-output/imarouter-ref2v-e2e-${runId}`;
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
	let context: SessionContext | null = null;
	let readyText = "";
	let resultText = "";

	try {
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
				assertCondition({
					condition: status === "disconnected",
					message: `expected disconnected after load, got ${status}`,
				});
				return `status=${status}`;
			},
		});

		await runStep({
			state,
			name: "reset active server session",
			screenshotName: "02-reset-active-session",
			action: async () => resetServerSessionThroughUi({ page }),
		});

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
			name: "natural language request runs real IMA Ref2V with reference image",
			screenshotName: "04-ref2v-request",
			action: async () => {
				if (!context) throw new Error("missing session context");
				await typePromptIntoTerminal({
					page,
					prompt: buildGenerationPrompt({
						root,
						referenceImageUrl: config.referenceImageUrl,
						useLocalReferenceFile: config.useLocalReferenceFile,
					}),
				});
				readyText = await waitForRef2VReady({
					context,
					root,
					timeoutMs: config.generationTimeoutMs,
				});
				resultText =
					(await fetchSessionText({
						context,
						remotePath: `${root}/ref2v-result.json`,
					})) || "";
				assertCondition({
					condition: readyText.includes("REF2V_READY"),
					message: "ready marker missing",
				});
				let resultStatus = "";
				try {
					resultStatus =
						(JSON.parse(resultText) as { status?: string }).status ?? "";
				} catch {
					resultStatus = "";
				}
				assertCondition({
					condition: resultStatus === "SUCCESS",
					message: "result JSON did not report SUCCESS",
				});
				return readyText.trim();
			},
		});

		await runStep({
			state,
			name: "download sandbox evidence files",
			screenshotName: "05-evidence-downloaded",
			action: async () => {
				if (!context) throw new Error("missing session context");
				const parsed = JSON.parse(resultText) as {
					videoPath?: string;
					sidecarPath?: string;
				};
				const paths = [
					`${root}/env-check.txt`,
					`${root}/models.json`,
					`${root}/ref2v-command.log`,
					`${root}/ffprobe.json`,
					`${root}/ref2v-result.json`,
					`${root}/ref2v-ready.txt`,
					parsed.videoPath || "",
					parsed.sidecarPath || "",
				].filter((entry) => entry.length > 0);
				await downloadEvidenceFiles({
					state,
					context,
					remotePaths: paths,
				});
				assertCondition({
					condition: state.downloads.some((item) =>
						item.remotePath.endsWith(".mp4")
					),
					message: "generated video was not downloaded",
				});
				return `downloaded=${state.downloads.length}`;
			},
		});

		await runStep({
			state,
			name: "final browser screenshot captures ready terminal",
			screenshotName: "06-final-proof",
			action: async () => {
				const terminalText = await readTerminalText({ page });
				return terminalText.includes("REF2V_READY")
					? "terminal shows REF2V_READY"
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
					referenceImageUrl: config.referenceImageUrl,
					useLocalReferenceFile: config.useLocalReferenceFile,
					outDir: config.outDir,
					steps: state.steps,
					readyText,
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
