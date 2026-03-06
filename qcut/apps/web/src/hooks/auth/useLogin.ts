import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLicenseStore } from "@/stores/license-store";

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
				const licenseApi = window.electronAPI?.license;
				if (licenseApi) {
					await licenseApi.setAuthToken(token);
					await licenseApi.activate(token);
				}
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

	const handleLogin = useCallback(async () => {
		setError(null);
		setIsEmailLoading(true);

		try {
			const licenseApi = window.electronAPI?.license;
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
			const licenseApi = window.electronAPI?.license;
			if (!licenseApi?.getGoogleLoginUrl) {
				setError("Google login is not available in this environment");
				setIsGoogleLoading(false);
				return;
			}

			const url = await licenseApi.getGoogleLoginUrl();
			if (!window.electronAPI?.shell?.openExternal) {
				setError("Could not open browser for Google login");
				setIsGoogleLoading(false);
				return;
			}
			await window.electronAPI.shell.openExternal(url);
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
