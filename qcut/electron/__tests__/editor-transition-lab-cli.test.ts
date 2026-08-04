import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { printHelp } from "../native-pipeline/cli/cli-help.js";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import { handleTransitionLabCommand } from "../native-pipeline/editor/editor-handlers-transition-lab.js";
import {
	BASE_URL,
	clearRoutes,
	installFetchMock,
	lastCapturedBody,
	lastCapturedMethod,
	lastCapturedUrl,
	makeOpts,
	mockRoute,
	originalFetch,
} from "./editor-cli-test-setup";

describe("Transition Lab CLI", () => {
	let client: EditorApiClient;

	beforeAll(() => {
		installFetchMock(BASE_URL);
		client = new EditorApiClient({ baseUrl: BASE_URL });
	});

	afterEach(() => clearRoutes());
	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses the nested apply command", () => {
		const options = parseCliArgs([
			"editor",
			"transition-lab",
			"apply",
			"--preset",
			"lab-page-curl",
			"--track-id",
			"track-1",
			"--from-element-id",
			"clip-a",
			"--to-element-id",
			"clip-b",
			"--duration",
			"0.75",
		]);

		expect(options).toMatchObject({
			command: "editor:transition-lab:apply",
			preset: "lab-page-curl",
			trackId: "track-1",
			fromElementId: "clip-a",
			toElementId: "clip-b",
			duration: "0.75",
		});
	});

	it("advertises Transition Lab in global help", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			printHelp();
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining("editor:transition-lab:*")
			);
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining("editor:navigator:*")
			);
		} finally {
			log.mockRestore();
		}
	});

	it("lists public recipe metadata without shader payloads or binary assets", async () => {
		const result = await handleTransitionLabCommand({
			client,
			options: makeOpts({ command: "editor:transition-lab:list" }),
		});
		const data = result.data as {
			count: number;
			recipes: Array<{
				id: string;
				shader: { binaryAssets: boolean };
			}>;
		};

		expect(result.success).toBe(true);
		expect(data.count).toBe(6);
		expect(data.recipes).toContainEqual(
			expect.objectContaining({ id: "lab-cube-rotate" })
		);
		expect(data.recipes.every((recipe) => !recipe.shader.binaryAssets)).toBe(
			true
		);
		expect(JSON.stringify(data)).not.toContain("fragmentSource");
	});

	it("applies the shared recipe contract through the editor timeline API", async () => {
		mockRoute(
			"POST",
			"/api/claude/timeline/project-1/tracks/track-1/transitions",
			{ success: true, data: { transitionId: "transition-1" } }
		);
		const result = await handleTransitionLabCommand({
			client,
			options: makeOpts({
				command: "editor:transition-lab:apply",
				projectId: "project-1",
				preset: "lab-page-curl",
				trackId: "track-1",
				fromElementId: "clip-a",
				toElementId: "clip-b",
				duration: "0.75",
			}),
		});

		expect(result.success).toBe(true);
		expect(lastCapturedMethod).toBe("POST");
		expect(lastCapturedUrl).toContain(
			"/api/claude/timeline/project-1/tracks/track-1/transitions"
		);
		expect(JSON.parse(lastCapturedBody ?? "{}")).toEqual({
			fromElementId: "clip-a",
			toElementId: "clip-b",
			presetId: "lab-page-curl",
			type: "page-flip",
			direction: "left",
			easing: "linear",
			tuning: { intensity: 0.7 },
			duration: 0.75,
		});
	});

	it("rejects unknown recipes before mutating the editor", async () => {
		const result = await handleTransitionLabCommand({
			client,
			options: makeOpts({
				command: "editor:transition-lab:apply",
				preset: "not-a-recipe",
			}),
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown Transition Lab preset");
		expect(lastCapturedMethod).toBe("");
	});
});
