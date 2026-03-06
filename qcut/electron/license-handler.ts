import {
	app,
	ipcMain,
	safeStorage,
	session,
	type IpcMainInvokeEvent,
} from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LICENSE_SERVER_URL =
	process.env.QCUT_LICENSE_SERVER_URL ||
	"https://qcut-license-server.zdhpeter.workers.dev";
const CACHE_FILE = "license-cache.enc";
const OFFLINE_GRACE_DAYS = 7;

interface CreditBalance {
	planCredits: number;
	topUpCredits: number;
	totalCredits: number;
	planCreditsResetAt: string;
}

interface LicenseInfo {
	plan: "free" | "pro" | "team";
	status: "active" | "past_due" | "cancelled" | "expired";
	currentPeriodEnd?: string;
	credits: CreditBalance;
	cachedAt?: number;
}

let authToken = "";

function setAuthToken({ token }: { token: string }): void {
	authToken = token.trim();
}

async function getAuthToken(): Promise<string> {
	try {
		if (authToken.length > 0) {
			return authToken;
		}

		const envToken = process.env.QCUT_AUTH_TOKEN;
		if (typeof envToken === "string" && envToken.trim().length > 0) {
			return envToken.trim();
		}

		const cookieNames = [
			"better-auth.session_token",
			"better-auth.session-token",
			"session_token",
			"auth_token",
		];
		for (const name of cookieNames) {
			const cookies = await session.defaultSession.cookies.get({ name });
			const matchingCookie = cookies.find(
				(cookie) => typeof cookie.value === "string" && cookie.value.length > 0
			);
			if (matchingCookie?.value) {
				return matchingCookie.value;
			}
		}

		return "";
	} catch {
		return "";
	}
}

function getCachePath(): string {
	try {
		return path.join(app.getPath("userData"), CACHE_FILE);
	} catch {
		return path.join(process.cwd(), CACHE_FILE);
	}
}

function cacheLicense({ license }: { license: LicenseInfo }): void {
	try {
		const data = JSON.stringify({ ...license, cachedAt: Date.now() });
		const cachePath = getCachePath();
		if (safeStorage.isEncryptionAvailable()) {
			const encrypted = safeStorage.encryptString(data);
			fs.writeFileSync(cachePath, encrypted);
			return;
		}
		fs.writeFileSync(cachePath, data, { mode: 0o600 });
	} catch (error) {
		console.error("[License] Failed to cache license:", error);
	}
}

const FREE_FALLBACK: LicenseInfo = {
	plan: "free",
	status: "active",
	credits: {
		planCredits: 50,
		topUpCredits: 0,
		totalCredits: 50,
		planCreditsResetAt: new Date(
			Date.now() + 30 * 24 * 60 * 60 * 1000
		).toISOString(),
	},
};

function getCachedLicense(): LicenseInfo {
	const cachePath = getCachePath();
	if (!fs.existsSync(cachePath)) {
		return FREE_FALLBACK;
	}

	try {
		const raw = fs.readFileSync(cachePath);
		const decrypted = safeStorage.isEncryptionAvailable()
			? safeStorage.decryptString(raw)
			: raw.toString("utf-8");
		const cached = JSON.parse(decrypted) as LicenseInfo;
		const cacheAgeInDays =
			(Date.now() - (cached.cachedAt || 0)) / (1000 * 60 * 60 * 24);
		if (cacheAgeInDays > OFFLINE_GRACE_DAYS) {
			return FREE_FALLBACK;
		}
		return cached;
	} catch {
		return FREE_FALLBACK;
	}
}

function clearCachedLicense(): void {
	try {
		const cachePath = getCachePath();
		if (fs.existsSync(cachePath)) {
			fs.unlinkSync(cachePath);
		}
	} catch (error) {
		console.error("[License] Failed to clear cache:", error);
	}
}

function getDeviceFingerprint(): string {
	return `${process.platform}-${os.hostname()}`;
}

function getDeviceName(): string {
	return os.hostname();
}

async function getOnlineLicense(): Promise<LicenseInfo | null> {
	try {
		const token = await getAuthToken();
		if (token.length === 0) {
			return null;
		}

		const response = await fetch(`${LICENSE_SERVER_URL}/api/license`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) {
			return null;
		}

		const payload = (await response.json()) as {
			license?: LicenseInfo;
		};
		if (!payload.license) {
			return null;
		}

		cacheLicense({ license: payload.license });
		return payload.license;
	} catch {
		return null;
	}
}

export function setupLicenseIPC(): void {
	ipcMain.handle("license:set-auth-token", async (_event, token: string) => {
		if (typeof token !== "string") {
			return false;
		}
		setAuthToken({ token });
		return authToken.length > 0;
	});

	ipcMain.handle("license:clear-auth-token", async () => {
		setAuthToken({ token: "" });
		return true;
	});

	ipcMain.handle("license:check", async (): Promise<LicenseInfo> => {
		try {
			const onlineLicense = await getOnlineLicense();
			if (onlineLicense) {
				return onlineLicense;
			}
			return getCachedLicense();
		} catch {
			return getCachedLicense();
		}
	});

	ipcMain.handle(
		"license:activate",
		async (_event: IpcMainInvokeEvent, token: string): Promise<boolean> => {
			if (typeof token !== "string" || token.trim().length === 0) {
				return false;
			}
			try {
				const response = await fetch(
					`${LICENSE_SERVER_URL}/api/license/activate`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${token}`,
						},
						body: JSON.stringify({
							deviceFingerprint: getDeviceFingerprint(),
							deviceName: getDeviceName(),
						}),
					}
				);
				if (!response.ok) {
					return false;
				}

				const payload = (await response.json()) as {
					license?: LicenseInfo;
				};
				if (payload.license) {
					cacheLicense({ license: payload.license });
				}
				return true;
			} catch {
				return false;
			}
		}
	);

	ipcMain.handle(
		"license:track-usage",
		async (
			_event: IpcMainInvokeEvent,
			type: "ai_generation" | "export" | "render"
		): Promise<boolean> => {
			if (typeof type !== "string" || type.trim().length === 0) {
				return false;
			}
			try {
				const token = await getAuthToken();
				if (token.length === 0) {
					return false;
				}

				const response = await fetch(`${LICENSE_SERVER_URL}/api/usage/track`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ type }),
				});
				return response.ok;
			} catch {
				return false;
			}
		}
	);

	ipcMain.handle(
		"license:deduct-credits",
		async (
			_event: IpcMainInvokeEvent,
			amount: number,
			modelKey: string,
			description: string
		): Promise<boolean> => {
			if (
				typeof amount !== "number" ||
				!Number.isFinite(amount) ||
				amount <= 0
			) {
				return false;
			}
			if (typeof modelKey !== "string" || modelKey.trim().length === 0) {
				return false;
			}
			if (typeof description !== "string" || description.trim().length === 0) {
				return false;
			}

			try {
				const token = await getAuthToken();
				if (token.length === 0) {
					return false;
				}

				const response = await fetch(
					`${LICENSE_SERVER_URL}/api/credits/deduct`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${token}`,
						},
						body: JSON.stringify({ amount, modelKey, description }),
					}
				);
				if (!response.ok) {
					return false;
				}

				const refreshedLicense = await getOnlineLicense();
				if (refreshedLicense) {
					cacheLicense({ license: refreshedLicense });
				}

				return true;
			} catch {
				return false;
			}
		}
	);

	ipcMain.handle("license:deactivate", async (): Promise<boolean> => {
		try {
			clearCachedLicense();
			return true;
		} catch {
			return false;
		}
	});

	ipcMain.handle(
		"license:email-login",
		async (
			_event: IpcMainInvokeEvent,
			{ email, password }: { email: string; password: string }
		): Promise<{ success: boolean; error?: string }> => {
			if (
				typeof email !== "string" ||
				email.trim().length === 0 ||
				typeof password !== "string" ||
				password.length === 0
			) {
				return { success: false, error: "Email and password are required" };
			}
			try {
				const response = await fetch(
					`${LICENSE_SERVER_URL}/api/auth/sign-in/email`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ email: email.trim(), password }),
					}
				);
				if (!response.ok) {
					const body = (await response
						.json()
						.catch(() => null)) as Record<string, unknown> | null;
					const message =
						(body?.message as string) ||
						(body?.error as string) ||
						"Invalid email or password";
					return { success: false, error: message };
				}
				const body = (await response.json()) as Record<string, unknown>;
				const session = body?.session as
					| Record<string, unknown>
					| undefined;
				const token =
					(body?.token as string) || (session?.token as string);
				if (typeof token !== "string" || token.length === 0) {
					return { success: false, error: "No session token received" };
				}
				setAuthToken({ token });
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Login failed",
				};
			}
		}
	);

	ipcMain.handle(
		"license:email-signup",
		async (
			_event: IpcMainInvokeEvent,
			{
				name,
				email,
				password,
			}: { name: string; email: string; password: string }
		): Promise<{ success: boolean; error?: string }> => {
			if (
				typeof name !== "string" ||
				name.trim().length === 0 ||
				typeof email !== "string" ||
				email.trim().length === 0 ||
				typeof password !== "string" ||
				password.length === 0
			) {
				return {
					success: false,
					error: "Name, email and password are required",
				};
			}
			try {
				const response = await fetch(
					`${LICENSE_SERVER_URL}/api/auth/sign-up/email`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							name: name.trim(),
							email: email.trim(),
							password,
						}),
					}
				);
				if (!response.ok) {
					const body = (await response
						.json()
						.catch(() => null)) as Record<string, unknown> | null;
					const message =
						(body?.message as string) ||
						(body?.error as string) ||
						"Sign up failed";
					return { success: false, error: message };
				}
				const body = (await response.json()) as Record<string, unknown>;
				const session = body?.session as
					| Record<string, unknown>
					| undefined;
				const token =
					(body?.token as string) || (session?.token as string);
				if (typeof token !== "string" || token.length === 0) {
					return { success: false, error: "No session token received" };
				}
				setAuthToken({ token });
				return { success: true };
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Sign up failed",
				};
			}
		}
	);

	ipcMain.handle("license:get-google-login-url", async (): Promise<string> => {
		const desktopBridge = `${LICENSE_SERVER_URL}/api/auth/oauth/desktop-bridge`;
		return `${LICENSE_SERVER_URL}/api/auth/google/start?redirect_url=${encodeURIComponent(desktopBridge)}`;
	});
}

export type { LicenseInfo };
