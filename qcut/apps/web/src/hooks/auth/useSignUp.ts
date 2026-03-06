import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLicenseStore } from "@/stores/license-store";

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
				const licenseApi = window.electronAPI?.license;
				if (licenseApi) {
					await licenseApi.setAuthToken(token);
					await licenseApi.activate(token);
				}
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
		const licenseApi = window.electronAPI?.license;
		if (!licenseApi?.onActivationToken) {
			return;
		}

		const unsubscribe = licenseApi.onActivationToken(async (token) => {
			setIsGoogleLoading(false);
			setIsWaitingForBrowser(false);
			await activateAndNavigate(token);
		});

		return () => unsubscribe();
	}, [activateAndNavigate]);

	const handleSignUp = useCallback(async () => {
		setError(null);
		setIsEmailLoading(true);

		try {
			const licenseApi = window.electronAPI?.license;
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
			setError(
				err instanceof Error ? err.message : "Sign up failed"
			);
		} finally {
			setIsEmailLoading(false);
		}
	}, [name, email, password, checkLicense, navigate]);

	const handleGoogleSignUp = useCallback(async () => {
		setError(null);
		setIsGoogleLoading(true);

		try {
			const licenseApi = window.electronAPI?.license;
			if (!licenseApi?.getGoogleLoginUrl) {
				setError("Google sign up is not available in this environment");
				setIsGoogleLoading(false);
				return;
			}

			const url = await licenseApi.getGoogleLoginUrl();
			const opened = await window.electronAPI?.shell?.openExternal(url);
			if (opened === false || !window.electronAPI?.shell) {
				setError("Could not open browser for Google sign up");
				setIsGoogleLoading(false);
				return;
			}
			setIsWaitingForBrowser(true);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to open Google sign up"
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
