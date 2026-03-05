import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dashboard } from "@/components/Dashboard";
import { makeSession } from "./helpers";

/** MockEventSource class. */
class MockEventSource {
	onmessage: ((event: MessageEvent) => void) | null = null;

	constructor(_url: string) {}

	close() {}
}

describe("Dashboard relay visibility", () => {
	beforeEach(() => {
		vi.stubGlobal("EventSource", MockEventSource as typeof EventSource);
	});

	/** Get visible session order. */
	function getVisibleSessionOrder({
		container,
	}: {
		container: HTMLElement;
	}): string[] {
		return Array.from(
			container.querySelectorAll<HTMLAnchorElement>('a[href^="/sessions/"]')
		).map((anchor) => anchor.getAttribute("href")?.replace("/sessions/", "") ?? "");
	}

	it("hides relay sessions from main board by default", () => {
		render(
			<Dashboard
				sessions={[
					makeSession({ id: "dgame-1", managed: true }),
					makeSession({
						id: "relay-dgame0228223652-a",
						managed: false,
						metadata: { tmuxName: "relay-dgame0228223652-a" },
					}),
				]}
				stats={{
					totalSessions: 2,
					workingSessions: 2,
					openPRs: 0,
					needsReview: 0,
				}}
			/>
		);

		expect(screen.getByText("dgame-1")).toBeInTheDocument();
		expect(screen.queryByText("relay-dgame0228223652-a")).not.toBeInTheDocument();
		expect(screen.getByLabelText("show relay daemons")).toBeInTheDocument();
	});

	it("shows relay panel when relay toggle is enabled", () => {
		render(
			<Dashboard
				sessions={[
					makeSession({ id: "dgame-1", managed: true }),
					makeSession({
						id: "relay-dgame0228223652-a",
						managed: false,
						metadata: { tmuxName: "relay-dgame0228223652-a" },
					}),
				]}
				stats={{
					totalSessions: 2,
					workingSessions: 2,
					openPRs: 0,
					needsReview: 0,
				}}
			/>
		);

		fireEvent.click(screen.getByLabelText("show relay daemons"));

		expect(screen.getByText("Relay Daemons")).toBeInTheDocument();
		expect(screen.getByText("relay-dgame0228223652-a")).toBeInTheDocument();
	});

	it("sorts sessions by CPU usage when sort toggle is enabled", () => {
		const sessions = [
			makeSession({
				id: "worker-low",
				summary: "low cpu",
				metadata: { cpu: "2.1" },
			}),
			makeSession({
				id: "worker-high",
				summary: "high cpu",
				metadata: { cpu: "78.4" },
			}),
			makeSession({
				id: "worker-mid",
				summary: "mid cpu",
				metadata: { cpu: "12.0" },
			}),
		];
		const { container } = render(<Dashboard sessions={sessions} />);

		expect(getVisibleSessionOrder({ container })).toEqual([
			"worker-low",
			"worker-high",
			"worker-mid",
		]);

		fireEvent.click(
			screen.getByRole("button", { name: "Sort sessions by CPU usage" })
		);

		expect(getVisibleSessionOrder({ container })).toEqual([
			"worker-high",
			"worker-mid",
			"worker-low",
		]);
	});
});
