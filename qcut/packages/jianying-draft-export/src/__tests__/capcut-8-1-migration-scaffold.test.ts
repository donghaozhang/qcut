import { describe, expect, it } from "vitest";
import {
	buildCapCut81MigrationScaffold,
	type BuildCapCut81MigrationScaffoldOptions,
	validateCapCut81MigrationScaffold,
} from "../capcut-8-1-migration-scaffold.js";

const DRAFT_ID = "11111111-2222-4333-8444-555555555555";
const PROJECT_ID = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
const TIMELINE_ID = "99999999-8888-4777-8666-555555555555";

function createOptions({
	finalBundleRootPath = "/exports/capcut/com.lveditor.draft",
}: {
	finalBundleRootPath?: string;
} = {}): BuildCapCut81MigrationScaffoldOptions {
	return {
		canvasHeight: 720,
		createdAtMicroseconds: 1_700_000_000_000_000,
		draftFolderName: "qcut-migration",
		draftId: DRAFT_ID,
		draftName: "QCut Migration",
		durationMicroseconds: 4_000_000,
		finalBundleRootPath,
		projectId: PROJECT_ID,
		timelineId: TIMELINE_ID,
		timelineMaterialsSize: 1_234_567,
		updatedAtMicroseconds: 1_700_000_065_999_999,
	};
}

function parseRecord({
	files,
	relativePath,
}: {
	files: ReadonlyMap<string, string>;
	relativePath: string;
}): Record<string, unknown> {
	const text = files.get(relativePath);
	expect(text).toBeDefined();
	const value = JSON.parse(text ?? "");
	expect(value).not.toBeNull();
	expect(Array.isArray(value)).toBe(false);
	expect(typeof value).toBe("object");
	return value as Record<string, unknown>;
}

function expectedRelativePaths(): string[] {
	const draft = "qcut-migration";
	const timeline = `${draft}/Timelines/${TIMELINE_ID}`;
	return [
		"root_meta_info.json",
		`${draft}/attachment_editing.json`,
		`${draft}/attachment_pc_common.json`,
		`${draft}/common_attachment/attachment_action_scene.json`,
		`${draft}/common_attachment/attachment_gen_ai_info.json`,
		`${draft}/common_attachment/attachment_pc_timeline.json`,
		`${draft}/common_attachment/attachment_script_video.json`,
		`${draft}/draft_agency_config.json`,
		`${draft}/draft_biz_config.json`,
		`${draft}/draft_meta_info.json`,
		`${draft}/draft_settings`,
		`${draft}/performance_opt_info.json`,
		`${draft}/timeline_layout.json`,
		`${draft}/Timelines/project.json`,
		`${draft}/Timelines/project.json.bak`,
		`${timeline}/attachment_editing.json`,
		`${timeline}/attachment_pc_common.json`,
		`${timeline}/common_attachment/attachment_action_scene.json`,
		`${timeline}/common_attachment/attachment_gen_ai_info.json`,
		`${timeline}/common_attachment/attachment_pc_timeline.json`,
		`${timeline}/common_attachment/attachment_script_video.json`,
	].sort();
}

describe("CapCut 8.1 migration bundle scaffold", () => {
	it("builds the exact deterministic sidecar set without content mirrors or assets", () => {
		const options = createOptions();
		const first = buildCapCut81MigrationScaffold(options);
		const second = buildCapCut81MigrationScaffold(options);

		expect([...first.keys()]).toEqual(expectedRelativePaths());
		expect([...first.entries()]).toEqual([...second.entries()]);
		expect(first).toHaveLength(21);
		expect(
			[...first.keys()].some(
				(path) =>
					path.includes("/assets/") ||
					path.endsWith("/draft_info.json") ||
					path.endsWith("/template-2.tmp")
			)
		).toBe(false);
		expect(() =>
			validateCapCut81MigrationScaffold({ files: first, options })
		).not.toThrow();
	});

	it("emits parseable JSON sidecars and preserves the observed empty biz file", () => {
		const files = buildCapCut81MigrationScaffold(createOptions());

		for (const [relativePath, text] of files) {
			if (relativePath.endsWith("/draft_biz_config.json")) {
				expect(text).toBe("");
				continue;
			}
			if (relativePath.endsWith("/draft_settings")) {
				expect(text).toBe(
					[
						"[General]",
						"draft_create_time=1700000000",
						"draft_last_edit_time=1700000065",
						"real_edit_keys=1",
						"real_edit_seconds=65",
						"",
					].join("\n")
				);
				continue;
			}
			expect(() => JSON.parse(text)).not.toThrow();
		}

		const agency = parseRecord({
			files,
			relativePath: "qcut-migration/draft_agency_config.json",
		});
		expect(agency.video_resolution).toBe(720);
	});

	it("keeps root registration, metadata size, project, and layout ids consistent", () => {
		const options = createOptions();
		const files = buildCapCut81MigrationScaffold(options);
		const root = parseRecord({
			files,
			relativePath: "root_meta_info.json",
		});
		const stores = root.all_draft_store as Record<string, unknown>[];
		const entry = stores[0];

		expect(root).toMatchObject({
			draft_ids: 1,
			root_path: options.finalBundleRootPath,
		});
		expect(entry).toMatchObject({
			draft_cover:
				"/exports/capcut/com.lveditor.draft/qcut-migration/draft_cover.jpg",
			draft_fold_path: "/exports/capcut/com.lveditor.draft/qcut-migration",
			draft_id: DRAFT_ID,
			draft_json_file:
				"/exports/capcut/com.lveditor.draft/qcut-migration/draft_info.json",
			draft_root_path: options.finalBundleRootPath,
			draft_timeline_materials_size: options.timelineMaterialsSize,
			tm_duration: options.durationMicroseconds,
		});

		const draftMeta = parseRecord({
			files,
			relativePath: "qcut-migration/draft_meta_info.json",
		});
		expect(draftMeta).toMatchObject({
			draft_id: DRAFT_ID,
			draft_timeline_materials_size_: options.timelineMaterialsSize,
			tm_duration: options.durationMicroseconds,
		});

		const projectPath = "qcut-migration/Timelines/project.json";
		const project = parseRecord({ files, relativePath: projectPath });
		expect(project).toMatchObject({
			id: PROJECT_ID,
			main_timeline_id: TIMELINE_ID,
			timelines: [
				{
					id: TIMELINE_ID,
					name: "Timeline 01",
				},
			],
		});
		expect(files.get(`${projectPath}.bak`)).toBe(files.get(projectPath));

		const layout = parseRecord({
			files,
			relativePath: "qcut-migration/timeline_layout.json",
		});
		expect(layout).toMatchObject({
			dockItems: [
				{
					timelineIds: [TIMELINE_ID],
					timelineNames: ["Timeline 01"],
				},
			],
		});
	});

	it("duplicates attachment defaults across root and active timeline scopes", () => {
		const files = buildCapCut81MigrationScaffold(createOptions());
		const attachmentPaths = [
			"attachment_editing.json",
			"attachment_pc_common.json",
			"common_attachment/attachment_action_scene.json",
			"common_attachment/attachment_gen_ai_info.json",
			"common_attachment/attachment_pc_timeline.json",
			"common_attachment/attachment_script_video.json",
		];

		for (const relativePath of attachmentPaths) {
			expect(files.get(`qcut-migration/${relativePath}`)).toBe(
				files.get(`qcut-migration/Timelines/${TIMELINE_ID}/${relativePath}`)
			);
		}
	});

	it("contains no baked-in machine identity or observed absolute path", () => {
		const files = buildCapCut81MigrationScaffold(createOptions());
		const serialized = JSON.stringify([...files.entries()]);

		expect(serialized).not.toContain("/Users/");
		expect(serialized).not.toContain("device_id");
		expect(serialized).not.toContain("hard_disk_id");
		expect(serialized).not.toContain("mac_address");
		expect(serialized).not.toContain("os_version");
		expect(serialized).not.toMatch(/\b[0-9a-f]{32}\b/i);
		expect(serialized).not.toContain("@");
	});

	it("preserves a caller-supplied Windows path convention without mixed separators", () => {
		const options = createOptions({
			finalBundleRootPath: "C:\\Bundle\\com.lveditor.draft",
		});
		const files = buildCapCut81MigrationScaffold(options);
		const root = parseRecord({
			files,
			relativePath: "root_meta_info.json",
		});
		const stores = root.all_draft_store as Record<string, unknown>[];

		expect(root.root_path).toBe("C:\\Bundle\\com.lveditor.draft");
		expect(stores[0]).toMatchObject({
			draft_cover:
				"C:\\Bundle\\com.lveditor.draft\\qcut-migration\\draft_cover.jpg",
			draft_fold_path: "C:\\Bundle\\com.lveditor.draft\\qcut-migration",
			draft_json_file:
				"C:\\Bundle\\com.lveditor.draft\\qcut-migration\\draft_info.json",
		});
		expect(
			JSON.stringify(stores[0]).includes("com.lveditor.draft/qcut-migration")
		).toBe(false);
	});

	it("rejects a scaffold whose generated timeline references drift", () => {
		const options = createOptions();
		const files = new Map(buildCapCut81MigrationScaffold(options));
		const layoutPath = "qcut-migration/timeline_layout.json";
		const layout = parseRecord({ files, relativePath: layoutPath });
		const dockItems = layout.dockItems as Array<Record<string, unknown>>;
		dockItems[0] = {
			...dockItems[0],
			timelineIds: ["00000000-0000-4000-8000-000000000000"],
		};
		files.set(layoutPath, JSON.stringify(layout));

		expect(() => validateCapCut81MigrationScaffold({ files, options })).toThrow(
			"timeline_layout.json references are inconsistent"
		);
	});

	it("rejects traversal, invalid ids, inconsistent time, and invalid size", () => {
		expect(() =>
			buildCapCut81MigrationScaffold({
				...createOptions(),
				draftFolderName: "../escape",
			})
		).toThrow("safe path segment");
		expect(() =>
			buildCapCut81MigrationScaffold({
				...createOptions(),
				finalBundleRootPath: "/exports/ok/../escape",
			})
		).toThrow("normalized absolute");
		expect(() =>
			buildCapCut81MigrationScaffold({
				...createOptions(),
				timelineId: "not-a-uuid",
			})
		).toThrow("timelineId must be a UUID");
		expect(() =>
			buildCapCut81MigrationScaffold({
				...createOptions(),
				timelineMaterialsSize: -1,
			})
		).toThrow("timelineMaterialsSize");
		expect(() =>
			buildCapCut81MigrationScaffold({
				...createOptions(),
				updatedAtMicroseconds: 1,
			})
		).toThrow("must not precede");
		expect(() =>
			buildCapCut81MigrationScaffold({
				...createOptions(),
				projectId: DRAFT_ID,
			})
		).toThrow("must be distinct");
	});
});
