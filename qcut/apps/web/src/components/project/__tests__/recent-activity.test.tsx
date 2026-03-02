import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentActivity } from "../recent-activity";
import type { TProject } from "@/types/project";

const mockExportStore = {
	exportHistory: [] as Array<{
		success: boolean;
		timestamp: Date;
		filename: string;
	}>,
};
const mockText2ImageStore = {
	generationHistory: [] as Array<{ createdAt: Date }>,
};

vi.mock("@/stores/export-store", () => ({
	useExportStore: (selector: (s: typeof mockExportStore) => unknown) =>
		selector(mockExportStore),
}));

vi.mock("@/stores/ai/text2image-store", () => ({
	useText2ImageStore: (selector: (s: typeof mockText2ImageStore) => unknown) =>
		selector(mockText2ImageStore),
}));

vi.mock("lucide-react", () => ({
	Film: () => <svg data-testid="film-icon" />,
	Pencil: () => <svg data-testid="pencil-icon" />,
	Sparkles: () => <svg data-testid="sparkles-icon" />,
}));

const makeProject = (overrides: Partial<TProject> = {}): TProject => ({
	id: "p1",
	name: "Test Project",
	thumbnail: "",
	createdAt: new Date("2025-01-01"),
	updatedAt: new Date("2025-06-15"),
	scenes: [],
	currentSceneId: "s1",
	canvasSize: { width: 1920, height: 1080 },
	canvasMode: "preset",
	...overrides,
});

describe("RecentActivity", () => {
	beforeEach(() => {
		mockExportStore.exportHistory = [];
		mockText2ImageStore.generationHistory = [];
	});

	it("shows empty message when no activity", () => {
		render(<RecentActivity projects={[]} />);
		expect(screen.getByText(/No recent activity/)).toBeTruthy();
	});

	it("shows last edited project name", () => {
		render(<RecentActivity projects={[makeProject({ name: "My Video" })]} />);
		expect(screen.getByText(/Last edited: My Video/)).toBeTruthy();
	});

	it("shows AI generation count for today", () => {
		mockText2ImageStore.generationHistory = [
			{ createdAt: new Date() },
			{ createdAt: new Date() },
		];
		render(<RecentActivity projects={[makeProject()]} />);
		expect(screen.getByText(/2 AI generations today/)).toBeTruthy();
	});

	it("shows last render time", () => {
		mockExportStore.exportHistory = [
			{ success: true, timestamp: new Date(), filename: "output.mp4" },
		];
		render(<RecentActivity projects={[makeProject()]} />);
		expect(screen.getByText(/Last render: just now/)).toBeTruthy();
	});
});
