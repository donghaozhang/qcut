import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { FC } from "react";

let LoginPage: FC;

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: FC }) => {
		LoginPage = opts.component;
		return {};
	},
	useNavigate: () => vi.fn(),
	Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => (
		<a href={props.to}>{children}</a>
	),
}));

vi.mock("@/hooks/auth/useLogin", () => ({
	useLogin: () => ({
		email: "",
		setEmail: vi.fn(),
		password: "",
		setPassword: vi.fn(),
		error: null,
		isEmailLoading: false,
		isGoogleLoading: false,
		isAnyLoading: false,
		isWaitingForBrowser: false,
		handleLogin: vi.fn(),
		handleGoogleLogin: vi.fn(),
		cancelBrowserLogin: vi.fn(),
	}),
}));

vi.mock("@/components/icons", () => ({
	GoogleIcon: () => <span>Google</span>,
}));

// Trigger createFileRoute
import("../../routes/login");

describe("LoginPage", () => {
	it("renders the login form", async () => {
		// Wait for dynamic import to resolve
		await vi.dynamicImportSettled();
		expect(LoginPage).toBeDefined();

		render(<LoginPage />);

		expect(screen.getByText("Welcome back")).toBeInTheDocument();
		expect(screen.getByText("Sign in")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
		expect(screen.getByLabelText("Password")).toBeInTheDocument();
		expect(screen.getByText("Sign up")).toBeInTheDocument();
	});
});
