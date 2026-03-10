import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { platform } from "@qcut/platform-core";
import { useLicenseStore } from "@/stores/license-store";

/**
 * Manages user signup flows (email and Google) and license activation, exposing state and handlers for use in signup UI.
 *
 * @returns An object containing signup state and action handlers:
 * - `name` / `setName`: current name and setter.
 * - `email` / `setEmail`: current email and setter.
 * - `password` / `setPassword`: current password and setter.
 * - `error`: last error message or `null`.
 * - `isEmailLoading`: `true` while an email signup request is in progress.
 * - `isGoogleLoading`: `true` while initiating Google signup.
 * - `isAnyLoading`: `true` if either `isEmailLoading` or `isGoogleLoading` is `true`.
 * - `isWaitingForBrowser`: `true` after opening the browser for Google OAuth and awaiting a callback.
 * - `handleSignUp`: performs email signup, activates the license, refreshes license state, and navigates on success.
 * - `handleGoogleSignUp`: starts Google signup by opening the OAuth URL in the system browser and awaits activation token via deep link.
 * - `cancelBrowserSignup`: cancels the in-browser Google signup waiting state.
 */
export function useSignUp() {
	const navigate = useNavigate();
	const checkLicense = useLicenseStore((s) => s.checkLicense);
	const [name, setName] = useState("");
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
				setError("Failed to activate license after signup");
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

	const handleSignUp = useCallback(async () => {
		setError(null);
		setIsEmailLoading(true);

		try {
			const licenseApi = platform().license;
			if (!licenseApi?.emailSignup) {
				setError("Sign up is not available in this environment");
				return;
			}

			const result = await licenseApi.emailSignup(name, email, password);
			if (!result.success) {
				setError(result.error || "Sign up failed");
				return;
			}

			await checkLicense();
			navigate({ to: "/projects" });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Sign up failed");
		} finally {
			setIsEmailLoading(false);
		}
	}, [name, email, password, checkLicense, navigate]);

	const handleGoogleSignUp = useCallback(async () => {
		setError(null);
		setIsGoogleLoading(true);

		try {
			const licenseApi = platform().license;
			if (!licenseApi?.getGoogleLoginUrl) {
				setError("Google sign up is not available in this environment");
				setIsGoogleLoading(false);
				return;
			}

			const url = await licenseApi.getGoogleLoginUrl();
			if (!url) {
				setError("Google sign up is not available in this environment");
				setIsGoogleLoading(false);
				return;
			}
			await platform().shell.openExternal(url);
			setIsWaitingForBrowser(true);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to open Google sign up"
			);
			setIsGoogleLoading(false);
			setIsWaitingForBrowser(false);
		}
	}, []);

	const cancelBrowserSignup = useCallback(() => {
		setIsGoogleLoading(false);
		setIsWaitingForBrowser(false);
	}, []);

	const isAnyLoading = isEmailLoading || isGoogleLoading;

	return {
		name,
		setName,
		email,
		setEmail,
		password,
		setPassword,
		error,
		isEmailLoading,
		isGoogleLoading,
		isAnyLoading,
		isWaitingForBrowser,
		handleSignUp,
		handleGoogleSignUp,
		cancelBrowserSignup,
	};
}
