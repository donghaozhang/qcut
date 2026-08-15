import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

interface CandidateDir {
	fullPath: string;
	mtimeMs: number;
}

interface StageTarget {
	platform: string;
	arch: string;
	key: string;
}

interface RunBinaryResult {
	exitCode: number | null;
	firstLine: string;
	stderr: string;
	error: string;
}

const DEFAULT_STAGE_TARGETS = [
	"darwin-arm64",
	"darwin-x64",
	"win32-x64",
	"linux-x64",
];
// A signed binary's first launch can include macOS trust validation.
const VERSION_TIMEOUT_MS = 30_000;

function getErrorMessage({ error }: { error: unknown }): string {
	try {
		if (error instanceof Error) {
			return error.message;
		}
		return String(error);
	} catch {
		return "Unknown error";
	}
}

function parseTargets({ rawTargets }: { rawTargets: string }): StageTarget[] {
	try {
		const uniqueKeys = new Set(
			rawTargets
				.split(",")
				.map((target) => target.trim())
				.filter(Boolean)
		);

		if (uniqueKeys.size === 0) {
			throw new Error("No staged AICP targets configured");
		}

		return Array.from(uniqueKeys).map((key) => {
			const [platform, arch] = key.split("-");
			if (!platform || !arch) {
				throw new Error(
					`Invalid staged target "${key}". Expected format "<platform>-<arch>".`
				);
			}
			return { platform, arch, key };
		});
	} catch (error: unknown) {
		throw new Error(
			`Failed to parse staged targets: ${getErrorMessage({ error })}`
		);
	}
}

function getBinaryName({ target }: { target: StageTarget }): string {
	try {
		return target.platform === "win32" ? "aicp.exe" : "aicp";
	} catch (error: unknown) {
		throw new Error(
			`Failed to resolve binary name: ${getErrorMessage({ error })}`
		);
	}
}

function isRunnableOnHost({ target }: { target: StageTarget }): boolean {
	try {
		return target.platform === process.platform && target.arch === process.arch;
	} catch {
		return false;
	}
}

function runBinaryVersion({
	binaryPath,
	timeoutMs,
}: {
	binaryPath: string;
	timeoutMs: number;
}): Promise<RunBinaryResult> {
	return new Promise((resolve) => {
		try {
			const proc = spawn(binaryPath, ["--version"], {
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";

			const timeoutId = setTimeout(() => {
				proc.kill();
				resolve({
					exitCode: null,
					firstLine: "",
					stderr,
					error: `timed out after ${timeoutMs}ms`,
				});
			}, timeoutMs);

			proc.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			proc.stderr?.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});

			proc.on("close", (exitCode: number | null) => {
				clearTimeout(timeoutId);
				const firstLine = (stdout.split(/\r?\n/)[0] ?? "").trim();
				resolve({ exitCode, firstLine, stderr, error: "" });
			});

			proc.on("error", (error: Error) => {
				clearTimeout(timeoutId);
				resolve({
					exitCode: null,
					firstLine: "",
					stderr,
					error: error.message,
				});
			});
		} catch (error: unknown) {
			resolve({
				exitCode: null,
				firstLine: "",
				stderr: "",
				error: getErrorMessage({ error }),
			});
		}
	});
}

async function resolveLatestResourcesDir(): Promise<string> {
	try {
		const distDir = join(process.cwd(), "dist-electron");
		if (!existsSync(distDir)) {
			throw new Error(`dist-electron not found: ${distDir}`);
		}

		const entries = await readdir(distDir, { withFileTypes: true });
		const candidateGroups = await Promise.all(
			entries.map(async (entry): Promise<string[]> => {
				if (!entry.isDirectory()) {
					return [];
				}

				const entryPath = join(distDir, entry.name);
				if (entry.name.endsWith("win-unpacked")) {
					return [join(entryPath, "resources")];
				}
				if (entry.name.endsWith("linux-unpacked")) {
					return [join(entryPath, "resources")];
				}

				const macBundleCandidates = await readdir(entryPath, {
					withFileTypes: true,
				}).catch(() => []);

				return macBundleCandidates
					.filter((macEntry) => macEntry.isDirectory())
					.filter((macEntry) => macEntry.name.endsWith(".app"))
					.map((macEntry) =>
						join(entryPath, macEntry.name, "Contents", "Resources")
					);
			})
		);

		const existingCandidates = candidateGroups
			.flat()
			.filter((candidatePath) => existsSync(candidatePath));

		if (existingCandidates.length === 0) {
			throw new Error(`No packaged resources directory found in: ${distDir}`);
		}

		const candidates: CandidateDir[] = await Promise.all(
			existingCandidates.map(async (fullPath): Promise<CandidateDir> => {
				const fileStat = await stat(fullPath);
				return { fullPath, mtimeMs: fileStat.mtimeMs };
			})
		);

		const newest = candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
		return newest.fullPath;
	} catch (error: unknown) {
		throw new Error(
			`Failed to resolve packaged resources directory: ${getErrorMessage({ error })}`
		);
	}
}

async function verifyPackagedAicp(): Promise<void> {
	try {
		const resourcesDir = await resolveLatestResourcesDir();
		const stagedRoot = join(resourcesDir, "bin", "aicp");
		if (!existsSync(stagedRoot)) {
			throw new Error(
				`Packaged staged AICP directory not found: ${stagedRoot}`
			);
		}

		const rawTargets =
			process.env.AICP_STAGE_TARGETS || DEFAULT_STAGE_TARGETS.join(",");
		const targets = parseTargets({ rawTargets });

		const missingPaths: string[] = [];
		for (const target of targets) {
			const binaryPath = join(
				stagedRoot,
				target.key,
				getBinaryName({ target })
			);
			if (!existsSync(binaryPath)) {
				missingPaths.push(binaryPath);
			}
		}

		if (missingPaths.length > 0) {
			throw new Error(
				`Missing staged AICP binaries in packaged app:\n${missingPaths.join("\n")}`
			);
		}

		const runnableTarget = targets.find((target) =>
			isRunnableOnHost({ target })
		);
		if (!runnableTarget) {
			process.stdout.write(
				`✅ Packaged AICP verification passed (presence only). No runnable host target in: ${targets.map((target) => target.key).join(", ")}\n`
			);
			return;
		}

		const binaryPath = join(
			stagedRoot,
			runnableTarget.key,
			getBinaryName({ target: runnableTarget })
		);

		const versionResult = await runBinaryVersion({
			binaryPath,
			timeoutMs: VERSION_TIMEOUT_MS,
		});

		if (versionResult.error || versionResult.exitCode !== 0) {
			throw new Error(
				`Packaged AICP binary failed host validation: exit=${versionResult.exitCode} error=${versionResult.error} stderr=${versionResult.stderr.trim()}`
			);
		}

		process.stdout.write(
			`✅ Packaged AICP verification passed: ${binaryPath}\n${versionResult.firstLine}\n`
		);
	} catch (error: unknown) {
		process.stderr.write(
			`❌ verify-packaged-aicp failed: ${getErrorMessage({ error })}\n`
		);
		process.exit(1);
	}
}

verifyPackagedAicp();
