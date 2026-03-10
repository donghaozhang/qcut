import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import { createWebAdapter } from "@qcut/platform-web";

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

import { useSignUp } from "../useSignUp";

describe("useSignUp", () => {
	let mockLicenseApi: Record<string, ReturnType<typeof vi.fn>>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockLicenseApi = {
			setAuthToken: vi.fn().mockResolvedValue(undefined),
			activate: vi.fn().mockResolvedValue(undefined),
			emailSignup: vi.fn().mockResolvedValue({ success: true }),
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
		const { result } = renderHook(() => useSignUp());
		expect(result.current.name).toBe("");
		expect(result.current.email).toBe("");
		expect(result.current.password).toBe("");
		expect(result.current.error).toBeNull();
		expect(result.current.isEmailLoading).toBe(false);
		expect(result.current.isGoogleLoading).toBe(false);
		expect(result.current.isAnyLoading).toBe(false);
		expect(result.current.isWaitingForBrowser).toBe(false);
	});

	it("updates name, email, and password", () => {
		const { result } = renderHook(() => useSignUp());
		act(() => result.current.setName("John"));
		act(() => result.current.setEmail("john@example.com"));
		act(() => result.current.setPassword("secret"));
		expect(result.current.name).toBe("John");
		expect(result.current.email).toBe("john@example.com");
		expect(result.current.password).toBe("secret");
	});

	describe("handleSignUp", () => {
		it("signs up successfully and navigates", async () => {
			const { result } = renderHook(() => useSignUp());
			act(() => {
				result.current.setName("John");
				result.current.setEmail("john@example.com");
				result.current.setPassword("pass123");
			});

			await act(() => result.current.handleSignUp());

			expect(mockLicenseApi.emailSignup).toHaveBeenCalledWith(
				"John",
				"john@example.com",
				"pass123"
			);
			expect(mockCheckLicense).toHaveBeenCalled();
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/projects" });
			expect(result.current.isEmailLoading).toBe(false);
			expect(result.current.error).toBeNull();
		});

		it("sets error when electronAPI is unavailable", async () => {
			initPlatform(createWebAdapter());
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleSignUp());

			expect(result.current.error).toBeTruthy();
			expect(result.current.isEmailLoading).toBe(false);
		});

		it("sets error when signup result is unsuccessful", async () => {
			mockLicenseApi.emailSignup.mockResolvedValue({
				success: false,
				error: "Email already exists",
			});
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleSignUp());

			expect(result.current.error).toBe("Email already exists");
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("uses fallback error message when result has no error string", async () => {
			mockLicenseApi.emailSignup.mockResolvedValue({ success: false });
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleSignUp());

			expect(result.current.error).toBe("Sign up failed");
		});

		it("catches thrown errors", async () => {
			mockLicenseApi.emailSignup.mockRejectedValue(new Error("Network error"));
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleSignUp());

			expect(result.current.error).toBe("Network error");
			expect(result.current.isEmailLoading).toBe(false);
		});

		it("uses fallback message for non-Error throws", async () => {
			mockLicenseApi.emailSignup.mockRejectedValue("string error");
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleSignUp());

			expect(result.current.error).toBe("Sign up failed");
		});
	});

	describe("handleGoogleSignUp", () => {
		it("opens external URL and sets waiting state", async () => {
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleGoogleSignUp());

			expect(mockLicenseApi.getGoogleLoginUrl).toHaveBeenCalled();
			expect(window.electronAPI!.shell!.openExternal).toHaveBeenCalledWith(
				"https://google.com/oauth"
			);
			expect(result.current.isWaitingForBrowser).toBe(true);
			expect(result.current.isGoogleLoading).toBe(true);
		});

		it("sets error when getGoogleLoginUrl is unavailable", async () => {
			initPlatform(createWebAdapter());
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleGoogleSignUp());

			// Web adapter returns empty URL — Google login opens blank, then user sees waiting state
			expect(result.current.isGoogleLoading).toBe(true);
		});

		it("sets error when shell.openExternal fails", async () => {
			(window as any).electronAPI.shell = {
				openExternal: vi.fn().mockRejectedValue(new Error("Shell unavailable")),
			};
			initPlatform(createDesktopAdapter());
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleGoogleSignUp());

			expect(result.current.error).toBe("Shell unavailable");
			expect(result.current.isGoogleLoading).toBe(false);
		});

		it("catches thrown errors", async () => {
			mockLicenseApi.getGoogleLoginUrl.mockRejectedValue(
				new Error("OAuth error")
			);
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleGoogleSignUp());

			expect(result.current.error).toBe("OAuth error");
			expect(result.current.isGoogleLoading).toBe(false);
			expect(result.current.isWaitingForBrowser).toBe(false);
		});

		it("uses fallback message for non-Error throws", async () => {
			mockLicenseApi.getGoogleLoginUrl.mockRejectedValue("fail");
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleGoogleSignUp());

			expect(result.current.error).toBe("Failed to open Google sign up");
		});
	});

	describe("cancelBrowserSignup", () => {
		it("resets google loading and waiting state", async () => {
			const { result } = renderHook(() => useSignUp());

			await act(() => result.current.handleGoogleSignUp());
			expect(result.current.isGoogleLoading).toBe(true);
			expect(result.current.isWaitingForBrowser).toBe(true);

			act(() => result.current.cancelBrowserSignup());
			expect(result.current.isGoogleLoading).toBe(false);
			expect(result.current.isWaitingForBrowser).toBe(false);
		});
	});

	describe("deep link token listener", () => {
		it("registers onActivationToken listener on mount", () => {
			renderHook(() => useSignUp());
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

			renderHook(() => useSignUp());

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

			const { result } = renderHook(() => useSignUp());

			await act(async () => {
				await tokenCallback!("bad-token");
			});

			expect(result.current.error).toBe(
				"Failed to activate license after signup"
			);
		});

		it("skips listener when onActivationToken is unavailable", () => {
			delete mockLicenseApi.onActivationToken;
			const { unmount } = renderHook(() => useSignUp());
			unmount(); // should not throw
		});

		it("calls unsubscribe on unmount", () => {
			const unsubscribe = vi.fn();
			mockLicenseApi.onActivationToken.mockReturnValue(unsubscribe);

			const { unmount } = renderHook(() => useSignUp());
			unmount();

			expect(unsubscribe).toHaveBeenCalled();
		});
	});
});
