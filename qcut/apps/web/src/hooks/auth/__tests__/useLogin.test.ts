import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";

const mockNavigate = vi.fn();
const mockCheckLicense = vi.fn<() => Promise<void>>();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
}));

vi.mock("@/stores/license-store", () => ({
	useLicenseStore: (
		selector: (s: { checkLicense: () => Promise<void> }) => unknown
	) => selector({ checkLicense: mockCheckLicense }),
}));

import { useLogin } from "../useLogin";

describe("useLogin", () => {
	let mockLicenseApi: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockLicenseApi = {
			setAuthToken: vi.fn().mockResolvedValue(undefined),
			activate: vi.fn().mockResolvedValue(undefined),
			emailLogin: vi.fn().mockResolvedValue({ success: true }),
			getGoogleLoginUrl: vi.fn().mockResolvedValue("https://google.com/oauth"),
			onActivationToken: vi.fn().mockReturnValue(() => {}),
		};
		(window as any).electronAPI = {
			license: mockLicenseApi,
			shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
		};
		initPlatform(createDesktopAdapter());
		mockCheckLicense.mockResolvedValue(undefined);
	});

	it("returns correct initial state", () => {
		const { result } = renderHook(() => useLogin());
		expect(result.current.email).toBe("");
		expect(result.current.password).toBe("");
		expect(result.current.error).toBeNull();
		expect(result.current.isEmailLoading).toBe(false);
		expect(result.current.isGoogleLoading).toBe(false);
		expect(result.current.isAnyLoading).toBe(false);
		expect(result.current.isWaitingForBrowser).toBe(false);
	});

	it("updates email and password", () => {
		const { result } = renderHook(() => useLogin());
		act(() => result.current.setEmail("test@example.com"));
		act(() => result.current.setPassword("secret"));
		expect(result.current.email).toBe("test@example.com");
		expect(result.current.password).toBe("secret");
	});

	describe("handleLogin", () => {
		it("logs in successfully and navigates", async () => {
			const { result } = renderHook(() => useLogin());
			act(() => {
				result.current.setEmail("test@example.com");
				result.current.setPassword("pass123");
			});

			await act(() => result.current.handleLogin());

			expect(mockLicenseApi.emailLogin).toHaveBeenCalledWith(
				"test@example.com",
				"pass123"
			);
			expect(mockCheckLicense).toHaveBeenCalled();
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/projects" });
			expect(result.current.isEmailLoading).toBe(false);
			expect(result.current.error).toBeNull();
		});

		it("sets error when electronAPI is unavailable", async () => {
			(window as any).electronAPI = {};
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleLogin());

			expect(result.current.error).toBe(
				"Login is not available in this environment"
			);
			expect(result.current.isEmailLoading).toBe(false);
		});

		it("sets error when login result is unsuccessful", async () => {
			mockLicenseApi.emailLogin.mockResolvedValue({
				success: false,
				error: "Invalid credentials",
			});
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleLogin());

			expect(result.current.error).toBe("Invalid credentials");
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("uses fallback error message when result has no error string", async () => {
			mockLicenseApi.emailLogin.mockResolvedValue({ success: false });
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleLogin());

			expect(result.current.error).toBe("Login failed");
		});

		it("catches thrown errors", async () => {
			mockLicenseApi.emailLogin.mockRejectedValue(new Error("Network error"));
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleLogin());

			expect(result.current.error).toBe("Network error");
			expect(result.current.isEmailLoading).toBe(false);
		});

		it("uses fallback message for non-Error throws", async () => {
			mockLicenseApi.emailLogin.mockRejectedValue("string error");
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleLogin());

			expect(result.current.error).toBe("Login failed");
		});
	});

	describe("handleGoogleLogin", () => {
		it("opens external URL and sets waiting state", async () => {
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleGoogleLogin());

			expect(mockLicenseApi.getGoogleLoginUrl).toHaveBeenCalled();
			expect(window.electronAPI!.shell!.openExternal).toHaveBeenCalledWith(
				"https://google.com/oauth"
			);
			expect(result.current.isWaitingForBrowser).toBe(true);
			expect(result.current.isGoogleLoading).toBe(true);
		});

		it("sets error when getGoogleLoginUrl is unavailable", async () => {
			delete mockLicenseApi.getGoogleLoginUrl;
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleGoogleLogin());

			expect(result.current.error).toBe(
				"Google login is not available in this environment"
			);
			expect(result.current.isGoogleLoading).toBe(false);
		});

		it("sets error when shell.openExternal is unavailable", async () => {
			(window as any).electronAPI.shell = {};
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleGoogleLogin());

			expect(result.current.error).toBe(
				"Could not open browser for Google login"
			);
			expect(result.current.isGoogleLoading).toBe(false);
		});

		it("catches thrown errors", async () => {
			mockLicenseApi.getGoogleLoginUrl.mockRejectedValue(
				new Error("OAuth error")
			);
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleGoogleLogin());

			expect(result.current.error).toBe("OAuth error");
			expect(result.current.isGoogleLoading).toBe(false);
			expect(result.current.isWaitingForBrowser).toBe(false);
		});

		it("uses fallback message for non-Error throws", async () => {
			mockLicenseApi.getGoogleLoginUrl.mockRejectedValue("fail");
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleGoogleLogin());

			expect(result.current.error).toBe("Failed to open Google login");
		});
	});

	describe("cancelBrowserLogin", () => {
		it("resets google loading and waiting state", async () => {
			const { result } = renderHook(() => useLogin());

			await act(() => result.current.handleGoogleLogin());
			expect(result.current.isGoogleLoading).toBe(true);
			expect(result.current.isWaitingForBrowser).toBe(true);

			act(() => result.current.cancelBrowserLogin());
			expect(result.current.isGoogleLoading).toBe(false);
			expect(result.current.isWaitingForBrowser).toBe(false);
		});
	});

	describe("deep link token listener", () => {
		it("registers onActivationToken listener on mount", () => {
			renderHook(() => useLogin());
			expect(mockLicenseApi.onActivationToken).toHaveBeenCalledWith(
				expect.any(Function)
			);
		});

		it("activates and navigates when token is received", async () => {
			let tokenCallback: (token: string) => Promise<void>;
			mockLicenseApi.onActivationToken.mockImplementation(
				(cb: (token: string) => Promise<void>) => {
					tokenCallback = cb;
					return () => {};
				}
			);

			renderHook(() => useLogin());

			await act(async () => {
				await tokenCallback!("test-token");
			});

			expect(mockLicenseApi.setAuthToken).toHaveBeenCalledWith("test-token");
			expect(mockLicenseApi.activate).toHaveBeenCalledWith("test-token");
			expect(mockCheckLicense).toHaveBeenCalled();
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/projects" });
		});

		it("sets error when activation fails", async () => {
			let tokenCallback: (token: string) => Promise<void>;
			mockLicenseApi.onActivationToken.mockImplementation(
				(cb: (token: string) => Promise<void>) => {
					tokenCallback = cb;
					return () => {};
				}
			);
			mockLicenseApi.activate.mockRejectedValue(new Error("fail"));

			const { result } = renderHook(() => useLogin());

			await act(async () => {
				await tokenCallback!("bad-token");
			});

			expect(result.current.error).toBe(
				"Failed to activate license after login"
			);
		});

		it("skips listener when onActivationToken is unavailable", () => {
			delete mockLicenseApi.onActivationToken;
			const { unmount } = renderHook(() => useLogin());
			unmount(); // should not throw
		});

		it("calls unsubscribe on unmount", () => {
			const unsubscribe = vi.fn();
			mockLicenseApi.onActivationToken.mockReturnValue(unsubscribe);

			const { unmount } = renderHook(() => useLogin());
			unmount();

			expect(unsubscribe).toHaveBeenCalled();
		});
	});

	describe("isAnyLoading", () => {
		it("is true when email loading", async () => {
			let resolveLogin: (v: { success: boolean }) => void;
			mockLicenseApi.emailLogin.mockReturnValue(
				new Promise((r) => {
					resolveLogin = r;
				})
			);

			const { result } = renderHook(() => useLogin());

			// Start login but don't await
			let loginPromise: Promise<void>;
			act(() => {
				loginPromise = result.current.handleLogin();
			});

			expect(result.current.isAnyLoading).toBe(true);

			await act(async () => {
				resolveLogin!({ success: true });
				await loginPromise!;
			});
		});
	});
});
