import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { platform } from "@qcut/platform-core";
import { useLicenseStore } from "@/stores/license-store";

/**
 * Custom React hook that manages email/password and Google login flows, license activation, and related UI state.
 *
 * The hook initiates authentication (email or Google), listens for deep-link activation tokens (Google OAuth callback),
 * activates the license and triggers license verification, and navigates to the projects view on successful activation.
 *
 * @returns An object with:
 * - `email`, `setEmail` — current email and setter
 * - `password`, `setPassword` — current password and setter
 * - `error` — last error message or `null`
 * - `isEmailLoading` — `true` while email login is in progress
 * - `isGoogleLoading` — `true` while Google login is in progress
 * - `isAnyLoading` — `true` if either email or Google login is in progress
 * - `isWaitingForBrowser` — `true` after opening an external browser for Google login and before callback
 * - `handleLogin` — starts the email/password login flow
 * - `handleGoogleLogin` — starts the Google OAuth flow by opening the external browser
 * - `cancelBrowserLogin` — cancels the browser-driven Google login state
 */
export function useLogin() {
	const navigate = useNavigate();
	const checkLicense = useLicenseStore((s) => s.checkLicense);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isEmailLoading, setIsEmailLoading] = useState(false);
	const [isGoogleLoading, setIsGoogleLoading] = useState(false);
	const [isWaitingForBrowser, setIsWaitingForBrowser] = useState(false);

	const activateAndNavigate = useCallback(
		async (token: string) => {
			try {
				const licenseApi = platform().license;
				await licenseApi.setAuthToken(token);
				await licenseApi.activate(token);
				await checkLicense();
				navigate({ to: "/projects" });
			} catch {
				setError("Failed to activate license after login");
			}
		},
		[checkLicense, navigate]
	);

	// Listen for deep link tokens (Google OAuth callback)
	useEffect(() => {
		try {
			const licenseApi = platform().license;
			if (!licenseApi?.onActivationToken) {
				return;
			}

			const unsubscribe = licenseApi.onActivationToken(async (token) => {
				setIsGoogleLoading(false);
				setIsWaitingForBrowser(false);
				await activateAndNavigate(token);
			});

			return () => unsubscribe?.();
		} catch {
			// License API not available on this platform — skip listener
		}
	}, [activateAndNavigate]);

	const handleLogin = useCallback(async () => {
		setError(null);
		setIsEmailLoading(true);

		try {
			const licenseApi = platform().license;
			if (!licenseApi?.emailLogin) {
				setError("Login is not available in this environment");
				return;
			}

			const result = await licenseApi.emailLogin(email, password);
			if (!result.success) {
				setError(result.error || "Login failed");
				return;
			}

			await checkLicense();
			navigate({ to: "/projects" });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed");
		} finally {
			setIsEmailLoading(false);
		}
	}, [email, password, checkLicense, navigate]);

	const handleGoogleLogin = useCallback(async () => {
		setError(null);
		setIsGoogleLoading(true);

		try {
			const licenseApi = platform().license;
			if (!licenseApi?.getGoogleLoginUrl) {
				setError("Google login is not available in this environment");
				setIsGoogleLoading(false);
				return;
			}

			const url = await licenseApi.getGoogleLoginUrl();
			await platform().shell.openExternal(url);
			setIsWaitingForBrowser(true);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to open Google login"
			);
			setIsGoogleLoading(false);
			setIsWaitingForBrowser(false);
		}
	}, []);

	const cancelBrowserLogin = useCallback(() => {
		setIsGoogleLoading(false);
		setIsWaitingForBrowser(false);
	}, []);

	const isAnyLoading = isEmailLoading || isGoogleLoading;

	return {
		email,
		setEmail,
		password,
		setPassword,
		error,
		isEmailLoading,
		isGoogleLoading,
		isAnyLoading,
		isWaitingForBrowser,
		handleLogin,
		handleGoogleLogin,
		cancelBrowserLogin,
	};
}
