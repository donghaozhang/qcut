import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { TProject } from "@/types/project";

// Store mocks
const mockExportStore = vi.fn();
const mockText2ImageStore = vi.fn();

vi.mock("@/stores/export-store", () => ({
	useExportStore: (selector: (s: unknown) => unknown) =>
		mockExportStore(selector),
}));

vi.mock("@/stores/ai/text2image-store", () => ({
	useText2ImageStore: (selector: (s: unknown) => unknown) =>
		mockText2ImageStore(selector),
}));

vi.mock("lucide-react", () => ({
	Film: (props: Record<string, unknown>) => <span {...props}>Film</span>,
	Pencil: (props: Record<string, unknown>) => <span {...props}>Pencil</span>,
	Sparkles: (props: Record<string, unknown>) => (
		<span {...props}>Sparkles</span>
	),
}));

import { RecentActivity } from "./recent-activity";

afterEach(() => {
	cleanup();
});

beforeEach(() => {
	mockExportStore.mockReturnValue([]);
	mockText2ImageStore.mockReturnValue([]);
});

const makeProject = (name: string, daysAgo: number): TProject => ({
	id: name,
	name,
	thumbnail: "",
	createdAt: new Date(Date.now() - daysAgo * 86400000),
	updatedAt: new Date(Date.now() - daysAgo * 86400000),
	scenes: [
		{
			id: "main",
			name: "Main",
			isMain: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	],
	currentSceneId: "main",
	canvasSize: { width: 1920, height: 1080 },
	canvasMode: "preset",
});

describe("RecentActivity", () => {
	it("shows empty state when no activity", () => {
		const { getByTestId } = render(<RecentActivity projects={[]} />);
		expect(getByTestId("recent-activity")).toHaveTextContent(
			"No recent activity"
		);
	});

	it("shows last edited project", () => {
		const projects = [makeProject("MyVideo", 1), makeProject("OldVideo", 5)];
		const { getByText } = render(<RecentActivity projects={projects} />);
		expect(getByText(/Last edited: MyVideo/)).toBeInTheDocument();
	});

	it("shows last render when export history has a successful entry", () => {
		mockExportStore.mockReturnValue([{ success: true, timestamp: new Date() }]);
		const { getByText } = render(<RecentActivity projects={[]} />);
		expect(getByText(/Last render: just now/)).toBeInTheDocument();
	});

	it("shows AI generation count for today", () => {
		mockText2ImageStore.mockReturnValue([
			{ createdAt: new Date() },
			{ createdAt: new Date() },
		]);
		const { getByText } = render(<RecentActivity projects={[]} />);
		expect(getByText(/2 AI generations today/)).toBeInTheDocument();
	});

	it("shows singular AI generation text for 1 generation", () => {
		mockText2ImageStore.mockReturnValue([{ createdAt: new Date() }]);
		const { getByText } = render(<RecentActivity projects={[]} />);
		expect(getByText(/1 AI generation today/)).toBeInTheDocument();
	});

	it("shows last generation time when no generations today", () => {
		const yesterday = new Date(Date.now() - 86400000 * 2);
		mockText2ImageStore.mockReturnValue([{ createdAt: yesterday }]);
		const { getByText } = render(<RecentActivity projects={[]} />);
		expect(getByText(/Last generation:/)).toBeInTheDocument();
	});
});
