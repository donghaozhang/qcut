import { describe, it, expect } from "vitest";
import type {
	PlatformApiKeyStatus,
	PlatformApiKeysStatus,
} from "@qcut/platform-core";
import { countShadowedAppSaves, getShadowedBy } from "../api-keys-view";

// A status object as returned by the IPC bridge in the wild. The shape is
// permissive — older Electron builds (pre `computeKeyStatus`) and certain
// IPC serialization edge cases can drop the `shadowedBy` array even though
// the TypeScript type marks it required.
type LooseStatus = Partial<Pick<PlatformApiKeyStatus, "shadowedBy">> &
	Omit<PlatformApiKeyStatus, "shadowedBy">;

function status(s: LooseStatus): PlatformApiKeyStatus {
	return s as PlatformApiKeyStatus;
}

const VALUES = {
	anthropicApiKey: "",
	elevenLabsApiKey: "",
	falApiKey: "",
	freesoundApiKey: "",
	geminiApiKey: "",
	gmiApiKey: "",
	imarouterApiKey: "",
	openRouterApiKey: "",
	runwayApiKey: "",
};

describe("countShadowedAppSaves — defensive against missing shadowedBy", () => {
	it("does not throw when a field's status entry is missing entirely", () => {
		const statuses: PlatformApiKeysStatus = {};
		expect(() =>
			countShadowedAppSaves({
				statuses,
				values: { ...VALUES, runwayApiKey: "rw_x" },
			})
		).not.toThrow();
		expect(
			countShadowedAppSaves({
				statuses,
				values: { ...VALUES, runwayApiKey: "rw_x" },
			})
		).toBe(0);
	});

	it("does not throw when shadowedBy is undefined on a present entry", () => {
		// Reproduces the issue: status returned without `shadowedBy`.
		const statuses: PlatformApiKeysStatus = {
			runwayApiKey: status({ set: true, source: "electron" }),
		};
		expect(() =>
			countShadowedAppSaves({
				statuses,
				values: { ...VALUES, runwayApiKey: "rw_x" },
			})
		).not.toThrow();
		expect(
			countShadowedAppSaves({
				statuses,
				values: { ...VALUES, runwayApiKey: "rw_x" },
			})
		).toBe(0);
	});

	it("counts entries whose shadowedBy includes 'electron'", () => {
		const statuses: PlatformApiKeysStatus = {
			falApiKey: {
				set: true,
				source: "environment",
				shadowedBy: ["electron"],
			},
			geminiApiKey: {
				set: true,
				source: "environment",
				shadowedBy: ["electron", "file"],
			},
			runwayApiKey: { set: true, source: "electron", shadowedBy: [] },
		};
		expect(
			countShadowedAppSaves({
				statuses,
				values: {
					...VALUES,
					falApiKey: "x",
					geminiApiKey: "y",
					runwayApiKey: "z",
				},
			})
		).toBe(2);
	});

	it("ignores fields whose value is empty even if shadowed", () => {
		const statuses: PlatformApiKeysStatus = {
			falApiKey: {
				set: true,
				source: "environment",
				shadowedBy: ["electron"],
			},
		};
		expect(countShadowedAppSaves({ statuses, values: VALUES })).toBe(0);
	});
});

describe("getShadowedBy — defensive against missing shadowedBy", () => {
	it("returns undefined when status is undefined", () => {
		expect(
			getShadowedBy({ fieldIsDirty: true, status: undefined })
		).toBeUndefined();
	});

	it("returns [] when status.shadowedBy is undefined and field is clean", () => {
		const result = getShadowedBy({
			fieldIsDirty: false,
			status: status({ set: true, source: "electron" }),
		});
		expect(result).toEqual([]);
	});

	it("appends 'electron' when dirty + environment-source + missing shadowedBy", () => {
		const result = getShadowedBy({
			fieldIsDirty: true,
			status: status({ set: true, source: "environment" }),
		});
		expect(result).toEqual(["electron"]);
	});

	it("does not duplicate 'electron' when already present", () => {
		const result = getShadowedBy({
			fieldIsDirty: true,
			status: {
				set: true,
				source: "environment",
				shadowedBy: ["electron"],
			},
		});
		expect(result).toEqual(["electron"]);
	});

	it("returns the existing shadowedBy array when not dirty", () => {
		const result = getShadowedBy({
			fieldIsDirty: false,
			status: {
				set: true,
				source: "environment",
				shadowedBy: ["electron", "file"],
			},
		});
		expect(result).toEqual(["electron", "file"]);
	});
});
