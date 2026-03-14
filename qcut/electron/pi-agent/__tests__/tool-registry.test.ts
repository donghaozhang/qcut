import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock CLI bridge
const mockExecCli = vi.fn();
vi.mock("../cli-bridge.js", () => ({
	execCli: (...args: unknown[]) => mockExecCli(...args),
}));

// Mock command registry with realistic data
vi.mock("../../native-pipeline/cli/command-registry.js", () => ({
	CATEGORIES: [
		{
			name: "generation",
			label: "Generation Commands",
			commands: ["generate-image", "create-video"],
		},
		{
			name: "editor",
			label: "Editor Commands",
			commands: ["editor:timeline-split", "editor:media-list"],
		},
	],
	COMMANDS_REGISTRY: {
		"generate-image": {
			name: "generate-image",
			description: "Generate an image from text",
			category: "generation",
			flags: [
				{
					name: "text",
					type: "string",
					description: "Text prompt",
					required: true,
				},
				{
					name: "model",
					type: "string",
					description: "Model key",
					default: "flux_dev",
				},
			],
			examples: ["--text 'A sunset' --model flux_dev"],
		},
		"create-video": {
			name: "create-video",
			description: "Create video from text",
			category: "generation",
			flags: [
				{ name: "text", type: "string", description: "Text prompt" },
			],
		},
		"editor:timeline-split": {
			name: "editor:timeline-split",
			description: "Split clip at time",
			category: "editor",
			flags: [
				{ name: "time", type: "string", description: "Split time" },
			],
		},
		"editor:media-list": {
			name: "editor:media-list",
			description: "List media items",
			category: "editor",
			flags: [],
		},
	},
}));

const { createPiAgentTools } = await import("../tool-registry.js");

describe("tool-registry", () => {
	beforeEach(() => {
		mockExecCli.mockReset();
	});

	describe("createPiAgentTools", () => {
		it("returns 18 tools", () => {
			const tools = createPiAgentTools();
			expect(tools).toHaveLength(18);
		});

		it("each tool has required properties", () => {
			const tools = createPiAgentTools();
			for (const tool of tools) {
				expect(tool).toHaveProperty("name");
				expect(tool).toHaveProperty("label");
				expect(tool).toHaveProperty("description");
				expect(tool).toHaveProperty("parameters");
				expect(tool).toHaveProperty("execute");
				expect(typeof tool.execute).toBe("function");
				expect(typeof tool.name).toBe("string");
				expect(tool.name.length).toBeGreaterThan(0);
			}
		});

		it("has unique tool names", () => {
			const tools = createPiAgentTools();
			const names = tools.map((t) => t.name);
			expect(new Set(names).size).toBe(names.length);
		});

		it("includes discovery tools", () => {
			const tools = createPiAgentTools();
			const names = tools.map((t) => t.name);
			expect(names).toContain("qcut_help");
			expect(names).toContain("qcut_command_help");
			expect(names).toContain("qcut_project_status");
		});

		it("includes core command tools", () => {
			const tools = createPiAgentTools();
			const names = tools.map((t) => t.name);
			expect(names).toContain("timeline_split");
			expect(names).toContain("media_import");
			expect(names).toContain("transcribe");
			expect(names).toContain("export_start");
			expect(names).toContain("generate_image");
			expect(names).toContain("qcut_run");
		});

		it("tool parameters have TypeBox schema", () => {
			const tools = createPiAgentTools();
			for (const tool of tools) {
				// TypeBox schemas have a "type" property
				expect(tool.parameters).toHaveProperty("type", "object");
				expect(tool.parameters).toHaveProperty("properties");
			}
		});
	});

	describe("qcut_help tool", () => {
		it("returns commands for a known category", async () => {
			const tools = createPiAgentTools();
			const helpTool = tools.find((t) => t.name === "qcut_help")!;

			const result = await helpTool.execute("call-1", { category: "generation" }, undefined as any, undefined as any);
			const text = result.content[0];
			expect(text.type).toBe("text");

			const parsed = JSON.parse((text as any).text);
			expect(parsed.category).toBe("generation");
			expect(parsed.label).toBe("Generation Commands");
			expect(parsed.commands).toHaveLength(2);
			expect(parsed.commands[0].name).toBe("generate-image");
		});

		it("returns error for unknown category", async () => {
			const tools = createPiAgentTools();
			const helpTool = tools.find((t) => t.name === "qcut_help")!;

			const result = await helpTool.execute("call-2", { category: "nonexistent" }, undefined as any, undefined as any);
			const parsed = JSON.parse((result.content[0] as any).text);

			expect(parsed.status).toBe("error");
			expect(parsed.message).toContain("nonexistent");
			expect(parsed.message).toContain("Available");
		});
	});

	describe("qcut_command_help tool", () => {
		it("returns full command details", async () => {
			const tools = createPiAgentTools();
			const cmdHelp = tools.find((t) => t.name === "qcut_command_help")!;

			const result = await cmdHelp.execute("call-3", { command: "generate-image" }, undefined as any, undefined as any);
			const parsed = JSON.parse((result.content[0] as any).text);

			expect(parsed.name).toBe("generate-image");
			expect(parsed.description).toBe("Generate an image from text");
			expect(parsed.category).toBe("generation");
			expect(parsed.flags).toHaveLength(2);
			expect(parsed.flags[0].name).toBe("text");
			expect(parsed.examples).toHaveLength(1);
		});

		it("returns error for unknown command", async () => {
			const tools = createPiAgentTools();
			const cmdHelp = tools.find((t) => t.name === "qcut_command_help")!;

			const result = await cmdHelp.execute("call-4", { command: "does-not-exist" }, undefined as any, undefined as any);
			const parsed = JSON.parse((result.content[0] as any).text);

			expect(parsed.status).toBe("error");
			expect(parsed.message).toContain("does-not-exist");
		});
	});

	describe("CLI-backed tools", () => {
		it("timeline_split calls execCli with correct command", async () => {
			mockExecCli.mockResolvedValue({ success: true });

			const tools = createPiAgentTools();
			const splitTool = tools.find((t) => t.name === "timeline_split")!;

			await splitTool.execute("call-5", { time: "00:01:30.500", track: 1 }, undefined as any, undefined as any);

			expect(mockExecCli).toHaveBeenCalledWith(
				"editor:timeline-split",
				expect.objectContaining({ time: "00:01:30.500", track: 1 })
			);
		});

		it("qcut_run passes dynamic command and args", async () => {
			mockExecCli.mockResolvedValue({ success: true, outputPath: "/out.mp4" });

			const tools = createPiAgentTools();
			const runTool = tools.find((t) => t.name === "qcut_run")!;

			await runTool.execute(
				"call-6",
				{ command: "generate-image", args: { text: "cat", model: "flux_dev" } },
				undefined as any,
				undefined as any,
			);

			expect(mockExecCli).toHaveBeenCalledWith(
				"generate-image",
				{ text: "cat", model: "flux_dev" }
			);
		});

		it("wraps execution errors with hint", async () => {
			mockExecCli.mockRejectedValue(new Error("No API key"));

			const tools = createPiAgentTools();
			const genTool = tools.find((t) => t.name === "generate_image")!;

			const result = await genTool.execute("call-7", { text: "cat" }, undefined as any, undefined as any);
			const parsed = JSON.parse((result.content[0] as any).text);

			expect(parsed.status).toBe("error");
			expect(parsed.message).toBe("No API key");
			expect(parsed.hint).toContain("qcut_command_help");
		});
	});
});
