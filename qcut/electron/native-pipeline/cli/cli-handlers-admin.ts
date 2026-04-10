/**
 * CLI Admin/Utility Command Handlers
 *
 * Handles non-generation commands: key management, project setup,
 * structure info, and example creation. Extracted from cli-runner.ts
 * to keep file sizes manageable.
 *
 * @module electron/native-pipeline/cli-handlers-admin
 */

import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";
import { ModelRegistry } from "../infra/registry.js";
import type { ModelCategory } from "../infra/registry.js";
import { estimateCost, listModels } from "../infra/cost-calculator.js";
import {
	setKey,
	getKey,
	deleteKey,
	isKnownKey,
	checkKeys,
	setupEnvTemplate,
} from "../infra/key-manager.js";
import { getLicenseServerUrl } from "../infra/proxy-client.js";
import {
	initProject,
	organizeProject,
	getStructureInfo,
} from "../editor/project-commands.js";
import { createExamples } from "./example-pipelines.js";
import { readHiddenInput } from "../cli/interactive.js";

export function handleSetup(): CLIResult {
	try {
		const envPath = setupEnvTemplate();
		return {
			success: true,
			data: { envPath, message: `API key template created at ${envPath}` },
		};
	} catch (err) {
		return {
			success: false,
			error: `Setup failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export async function handleSetKey(options: CLIRunOptions): Promise<CLIResult> {
	if (!options.keyName) {
		return { success: false, error: "Missing --name" };
	}
	if (!isKnownKey(options.keyName)) {
		return {
			success: false,
			error: `Unknown key '${options.keyName}'. Use check-keys to see valid key names.`,
		};
	}

	let value = options.keyValue;
	if (!value) {
		try {
			value = await readHiddenInput(`Enter value for ${options.keyName}: `);
		} catch {
			return {
				success: false,
				error: "Failed to read key value from input",
			};
		}
	}

	if (!value) {
		return { success: false, error: "Empty key value" };
	}

	if (options.keyValue) {
		console.error(
			"Warning: --value passes the key in plaintext. " +
				"Prefer interactive prompt or pipe via stdin for security."
		);
	}

	setKey(options.keyName, value);
	return {
		success: true,
		data: { message: `Key '${options.keyName}' saved` },
	};
}

export function handleGetKey(options: CLIRunOptions): CLIResult {
	if (!options.keyName) {
		return { success: false, error: "Missing --name" };
	}
	const value = getKey(options.keyName);
	if (!value) {
		return { success: false, error: `Key '${options.keyName}' not found` };
	}

	if (options.reveal) {
		return {
			success: true,
			data: { name: options.keyName, value },
		};
	}

	const masked =
		value.length > 8 ? value.slice(0, 4) + "****" + value.slice(-4) : "****";
	return { success: true, data: { name: options.keyName, masked } };
}

export function handleCheckKeys(): CLIResult {
	const keys = checkKeys();
	return { success: true, data: { keys } };
}

export function handleDeleteKey(options: CLIRunOptions): CLIResult {
	if (!options.keyName) {
		return { success: false, error: "Missing --name" };
	}
	if (!isKnownKey(options.keyName)) {
		return {
			success: false,
			error: `Unknown key '${options.keyName}'. Use check-keys to see valid key names.`,
		};
	}
	const deleted = deleteKey(options.keyName);
	if (!deleted) {
		return {
			success: false,
			error: `Key '${options.keyName}' not found in config`,
		};
	}
	return {
		success: true,
		data: { message: `Key '${options.keyName}' deleted` },
	};
}

export function handleInitProject(options: CLIRunOptions): CLIResult {
	const directory = options.directory || options.outputDir || ".";
	try {
		const result = initProject(directory, options.dryRun);
		return {
			success: true,
			data: {
				projectDir: result.projectDir,
				created: result.created,
				skipped: result.skipped,
				message: result.created.length
					? `Created ${result.created.length} directories`
					: "Project structure already exists",
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Init project failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export function handleOrganizeProject(options: CLIRunOptions): CLIResult {
	const directory = options.directory || options.outputDir || ".";
	const result = organizeProject(directory, {
		sourceDir: options.source,
		dryRun: options.dryRun,
		recursive: options.recursive,
		includeOutput: options.includeOutput,
	});
	if (result.errors.length > 0) {
		return {
			success: false,
			error: result.errors.join("; "),
			data: { moved: result.moved.length, skipped: result.skipped.length },
		};
	}
	return {
		success: true,
		data: {
			moved: result.moved.length,
			skipped: result.skipped.length,
			files: result.moved,
			message: `Organized ${result.moved.length} files`,
		},
	};
}

export function handleStructureInfo(options: CLIRunOptions): CLIResult {
	const directory = options.directory || options.outputDir || ".";
	try {
		const info = getStructureInfo(directory);
		return {
			success: true,
			data: {
				projectDir: info.projectDir,
				exists: info.exists,
				directories: info.directories,
				totalFiles: info.totalFiles,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Structure info failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export function handleCreateExamples(options: CLIRunOptions): CLIResult {
	const outputDir = options.outputDir || "./examples";
	try {
		const created = createExamples(outputDir);
		return {
			success: true,
			data: { created, count: created.length },
		};
	} catch (err) {
		return {
			success: false,
			error: `Create examples failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export function handleListModels(options: CLIRunOptions): CLIResult {
	const category = options.category as ModelCategory | undefined;
	const models = category ? listModels({ category }) : listModels();

	return {
		success: true,
		data: {
			models: models.map((m) => ({
				key: m.key,
				name: m.name,
				provider: m.provider,
				categories: m.categories,
				costEstimate: m.costEstimate,
				description: m.description,
			})),
			count: models.length,
		},
	};
}

/** Log in with email/password and store the session token. */
export async function handleLogin(options: CLIRunOptions): Promise<CLIResult> {
	if (!options.email) {
		return { success: false, error: "Missing --email" };
	}

	let password = options.password;
	if (!password) {
		try {
			password = await readHiddenInput("Enter password: ");
		} catch {
			return { success: false, error: "Failed to read password" };
		}
	}
	if (!password) {
		return { success: false, error: "Empty password" };
	}

	try {
		const baseUrl = getLicenseServerUrl();
		const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: options.email.trim(), password }),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			if (response.status >= 500) {
				return {
					success: false,
					error: `Server error (${response.status}) — please retry`,
				};
			}
			const body = (await response.json().catch(() => null)) as Record<
				string,
				unknown
			> | null;
			const message =
				(body?.message as string) ||
				(body?.error as string) ||
				"Invalid email or password";
			return { success: false, error: message };
		}

		const body = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		const session = body?.session as Record<string, unknown> | undefined;
		const token = (body?.token as string) || (session?.token as string);
		if (typeof token !== "string" || token.length === 0) {
			return { success: false, error: "No session token received" };
		}

		setKey("QCUT_AUTH_TOKEN", token);
		return {
			success: true,
			data: { message: `Logged in as ${options.email.trim()}` },
		};
	} catch (err) {
		return {
			success: false,
			error: `Login failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/** Create a new account and store the session token. */
export async function handleSignup(options: CLIRunOptions): Promise<CLIResult> {
	if (!options.email) {
		return { success: false, error: "Missing --email" };
	}
	if (!options.keyName) {
		// --name maps to keyName in CLIRunOptions
		return { success: false, error: "Missing --name (display name)" };
	}

	let password = options.password;
	if (!password) {
		try {
			password = await readHiddenInput("Enter password: ");
		} catch {
			return { success: false, error: "Failed to read password" };
		}
	}
	if (!password) {
		return { success: false, error: "Empty password" };
	}

	try {
		const baseUrl = getLicenseServerUrl();
		const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: options.keyName.trim(),
				email: options.email.trim(),
				password,
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			if (response.status >= 500) {
				return {
					success: false,
					error: `Server error (${response.status}) — please retry`,
				};
			}
			const body = (await response.json().catch(() => null)) as Record<
				string,
				unknown
			> | null;
			const message =
				(body?.message as string) ||
				(body?.error as string) ||
				"Sign up failed";
			return { success: false, error: message };
		}

		const body = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		const session = body?.session as Record<string, unknown> | undefined;
		const token = (body?.token as string) || (session?.token as string);
		if (typeof token !== "string" || token.length === 0) {
			return { success: false, error: "No session token received" };
		}

		setKey("QCUT_AUTH_TOKEN", token);
		return {
			success: true,
			data: {
				message: `Account created and logged in as ${options.email.trim()}`,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Sign up failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/** Clear the stored session token. */
export function handleLogout(): CLIResult {
	const deleted = deleteKey("QCUT_AUTH_TOKEN");
	return {
		success: true,
		data: {
			message: deleted
				? "Logged out — session token cleared"
				: "Already logged out (no token stored)",
		},
	};
}

export function handleEstimateCost(options: CLIRunOptions): CLIResult {
	if (!options.model) {
		return {
			success: false,
			error: "Missing --model. Run --help for usage.",
		};
	}
	if (!ModelRegistry.has(options.model)) {
		return {
			success: false,
			error: `Unknown model '${options.model}'. Run list-models to see available models.`,
		};
	}

	const params: Record<string, unknown> = {};
	if (options.duration) params.duration = options.duration;
	if (options.resolution) params.resolution = options.resolution;

	const estimate = estimateCost(options.model, params);
	return { success: true, cost: estimate.totalCost, data: estimate };
}
