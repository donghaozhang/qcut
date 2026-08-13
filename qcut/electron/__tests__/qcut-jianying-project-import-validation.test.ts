import { describe, expect, it } from "vitest";
import { QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA } from "../types/qcut-jianying-project-import-api";
import {
	parseQCutJianyingProjectImportRequest,
	parseQCutJianyingProjectImportResult,
} from "../types/qcut-jianying-project-import-validation";

const WARNING = "a".repeat(64);

describe("Jianying project import wire validation", () => {
	it("accepts a strict path-bearing import request", () => {
		expect(
			parseQCutJianyingProjectImportRequest({
				value: {
					acceptedWarningFingerprints: [WARNING],
					draftPath: "/private/drafts/project",
				},
			})
		).toEqual({
			acceptedWarningFingerprints: [WARNING],
			draftPath: "/private/drafts/project",
		});
	});

	it("rejects relative paths and unrecognized request fields", () => {
		expect(() =>
			parseQCutJianyingProjectImportRequest({
				value: {
					acceptedWarningFingerprints: [],
					draftPath: "relative/project",
				},
			})
		).toThrow("absolute");
		expect(() =>
			parseQCutJianyingProjectImportRequest({
				value: {
					acceptedWarningFingerprints: [],
					draftPath: "/private/drafts/project",
					envelope: "plaintext",
				},
			})
		).toThrow("unsupported field");
	});

	it("accepts an explicitly reversible imported result", () => {
		expect(
			parseQCutJianyingProjectImportResult({
				value: {
					outcome: "imported",
					profileId: "jianying-macos-11.3.0-beta2-plaintext-subdraft",
					projectId: "project-1",
					reversible: true,
					schema: QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
					schemaVersion: 1,
					selectedSubdraftId: "compound-1",
					sourceScope: "compound-subdraft",
					warningFingerprints: [WARNING],
				},
			})
		).toMatchObject({
			outcome: "imported",
			projectId: "project-1",
			reversible: true,
		});
	});

	it("rejects imported results without the reversible guarantee", () => {
		expect(() =>
			parseQCutJianyingProjectImportResult({
				value: {
					outcome: "imported",
					profileId: "profile",
					projectId: "project-1",
					reversible: false,
					schema: QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
					schemaVersion: 1,
					sourceScope: "selected-directory",
					warningFingerprints: [],
				},
			})
		).toThrow("reversible");
	});
});
