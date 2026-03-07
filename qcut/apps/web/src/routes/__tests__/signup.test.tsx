import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { FC } from "react";

let SignUpPage: FC;

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: FC }) => {
		SignUpPage = opts.component;
		return {};
	},
	useNavigate: () => vi.fn(),
	Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => (
		<a href={props.to}>{children}</a>
	),
}));

vi.mock("@/hooks/auth/useSignUp", () => ({
	useSignUp: () => ({
		name: "",
		setName: vi.fn(),
		email: "",
		setEmail: vi.fn(),
		password: "",
		setPassword: vi.fn(),
		error: null,
		isEmailLoading: false,
		isGoogleLoading: false,
		isAnyLoading: false,
		isWaitingForBrowser: false,
		handleSignUp: vi.fn(),
		handleGoogleSignUp: vi.fn(),
		cancelBrowserSignup: vi.fn(),
	}),
}));

vi.mock("@/components/icons", () => ({
	GoogleIcon: () => <span>Google</span>,
}));

// Trigger createFileRoute
import("../../routes/signup");

describe("SignUpPage", () => {
	it("renders the signup form", async () => {
		await vi.dynamicImportSettled();
		expect(SignUpPage).toBeDefined();

		render(<SignUpPage />);

		expect(screen.getByText("Create your account")).toBeInTheDocument();
		expect(screen.getByText("Create account")).toBeInTheDocument();
		expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
		expect(screen.getByLabelText("Password")).toBeInTheDocument();
		expect(screen.getByText("Sign in")).toBeInTheDocument();
	});
});
