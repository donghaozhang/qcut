import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
	GateBlockerPanel,
	GateBlockerPanelLoader,
} from "@/components/GateBlockerPanel";
import type { DashboardPolicyGate } from "@/lib/types";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeGate(
	overrides: Partial<DashboardPolicyGate> = {}
): DashboardPolicyGate {
	return {
		passed: false,
		mode: "enforced",
		violations: [{ code: "CI_FAILING", message: "CI checks are failing" }],
		failingChecks: [],
		checkedAt: new Date().toISOString(),
		...overrides,
	};
}

// ── GateBlockerPanel ──────────────────────────────────────────────────

describe("GateBlockerPanel", () => {
	it("renders nothing when no violations", () => {
		const { container } = render(
			<GateBlockerPanel
				sessionId="s1"
				gate={makeGate({ violations: [], passed: true })}
			/>
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders red callout in enforced mode", () => {
		render(
			<GateBlockerPanel
				sessionId="s1"
				gate={makeGate({ mode: "enforced" })}
			/>
		);
		const panel = screen.getByTestId("gate-blocker-panel");
		expect(panel).toBeInTheDocument();
		expect(panel).toHaveAttribute("data-mode", "enforced");
		expect(screen.getByText(/Gate Blocked/i)).toBeInTheDocument();
	});

	it("renders yellow callout in advisory mode", () => {
		render(
			<GateBlockerPanel
				sessionId="s1"
				gate={makeGate({ mode: "advisory" })}
			/>
		);
		const panel = screen.getByTestId("gate-blocker-panel");
		expect(panel).toHaveAttribute("data-mode", "advisory");
		expect(screen.getByText(/Gate Warnings/i)).toBeInTheDocument();
	});

	it("renders violation code and message", () => {
		render(
			<GateBlockerPanel
				sessionId="s1"
				gate={makeGate({
					violations: [
						{ code: "NO_APPROVAL", message: "PR is not approved" },
					],
				})}
			/>
		);
		expect(screen.getByText("NO_APPROVAL")).toBeInTheDocument();
		expect(screen.getByText(/PR is not approved/)).toBeInTheDocument();
	});

	it("renders blockerClass when present", () => {
		render(
			<GateBlockerPanel
				sessionId="s1"
				gate={makeGate({
					violations: [
						{
							code: "CI_FAILING",
							message: "CI checks are failing",
							blockerClass: "ci_failure",
						},
					],
				})}
			/>
		);
		expect(screen.getByText("[ci_failure]")).toBeInTheDocument();
	});

	it("renders failing checks when present", () => {
		render(
			<GateBlockerPanel
				sessionId="s1"
				gate={makeGate({ failingChecks: ["build", "typecheck"] })}
			/>
		);
		expect(screen.getByText(/build, typecheck/)).toBeInTheDocument();
	});

	it("has a refresh button", () => {
		render(
			<GateBlockerPanel sessionId="s1" gate={makeGate()} />
		);
		expect(
			screen.getByRole("button", { name: /Refresh gate status/i })
		).toBeInTheDocument();
	});
});

// ── GateBlockerPanelLoader ────────────────────────────────────────────

describe("GateBlockerPanelLoader", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders nothing while gate has not loaded and no violations", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () =>
				makeGate({ violations: [], passed: true }) satisfies DashboardPolicyGate,
		});
		vi.stubGlobal("fetch", fetchMock);

		const { container } = render(
			<GateBlockerPanelLoader sessionId="s-no-violations" />
		);

		// Initially nothing (gate not yet fetched)
		expect(container.firstChild).toBeNull();

		// After fetch completes, still nothing (no violations)
		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(container.firstChild).toBeNull();
	});

	it("renders panel after fetching violations", async () => {
		const gate = makeGate({
			mode: "enforced",
			violations: [{ code: "CI_FAILING", message: "CI is failing" }],
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: true, json: async () => gate })
		);

		render(<GateBlockerPanelLoader sessionId="s-with-violations" />);

		await waitFor(() =>
			expect(screen.getByTestId("gate-blocker-panel")).toBeInTheDocument()
		);
		expect(screen.getByText(/Gate Blocked/i)).toBeInTheDocument();
	});

	it("calls the correct policy endpoint", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => makeGate({ violations: [], passed: true }),
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<GateBlockerPanelLoader sessionId="my-session-id" />);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/sessions/my-session-id/policy"
		);
	});
});
