import { beforeEach, describe, expect, it } from "vitest";
import type { TimelineTemplate } from "@qcut/editor-core/templates";
import {
	CUSTOM_TIMELINE_TEMPLATES_STORAGE_KEY,
	importCustomTimelineTemplates,
	loadCustomTimelineTemplates,
	removeCustomTimelineTemplate,
} from "../custom-template-registry";
import { TIMELINE_TEMPLATES } from "../template-registry";

function customTemplate({
	id = "custom-story",
	name = "Custom Story",
}: {
	id?: string;
	name?: string;
} = {}): TimelineTemplate {
	return {
		...structuredClone(TIMELINE_TEMPLATES[0]),
		id,
		name,
		version: "1.0.0",
	};
}

describe("custom timeline template registry", () => {
	beforeEach(() => {
		const values = new Map<string, string>();
		const storage: Storage = {
			get length() {
				return values.size;
			},
			clear: () => values.clear(),
			getItem: (key) => values.get(key) ?? null,
			key: (index) => [...values.keys()][index] ?? null,
			removeItem: (key) => {
				values.delete(key);
			},
			setItem: (key, value) => {
				values.set(key, value);
			},
		};
		Object.defineProperty(window, "localStorage", {
			value: storage,
			writable: true,
		});
	});

	it("imports a validated template and persists it", () => {
		const imported = importCustomTimelineTemplates({
			text: JSON.stringify(customTemplate()),
			builtInIds: new Set(TIMELINE_TEMPLATES.map((template) => template.id)),
		});

		expect(imported).toHaveLength(1);
		expect(loadCustomTimelineTemplates()).toEqual(imported);
		expect(
			localStorage.getItem(CUSTOM_TIMELINE_TEMPLATES_STORAGE_KEY)
		).toContain("custom-story");
	});

	it("updates an imported template with the same id without duplicating it", () => {
		const builtInIds = new Set(
			TIMELINE_TEMPLATES.map((template) => template.id)
		);
		importCustomTimelineTemplates({
			text: JSON.stringify(customTemplate()),
			builtInIds,
		});
		importCustomTimelineTemplates({
			text: JSON.stringify(customTemplate({ name: "Updated" })),
			builtInIds,
		});

		expect(loadCustomTimelineTemplates()).toMatchObject([
			{ id: "custom-story", name: "Updated" },
		]);
	});

	it("rejects malformed files and built-in ids", () => {
		expect(() =>
			importCustomTimelineTemplates({
				text: "not-json",
				builtInIds: new Set(),
			})
		).toThrow("not valid JSON");
		expect(() =>
			importCustomTimelineTemplates({
				text: JSON.stringify(customTemplate({ id: TIMELINE_TEMPLATES[0].id })),
				builtInIds: new Set([TIMELINE_TEMPLATES[0].id]),
			})
		).toThrow("reserved by QCut");
	});

	it("removes a custom template without touching other entries", () => {
		const builtInIds = new Set<string>();
		importCustomTimelineTemplates({
			text: JSON.stringify([
				customTemplate(),
				customTemplate({ id: "second", name: "Second" }),
			]),
			builtInIds,
		});

		const remaining = removeCustomTimelineTemplate({
			templateId: "custom-story",
		});
		expect(remaining.map((template) => template.id)).toEqual(["second"]);
	});
});
