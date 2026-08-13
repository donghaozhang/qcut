import { describe, expect, it } from "vitest";
import {
	QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
	type QCutJianyingProjectExportResult,
} from "../types/qcut-jianying-project-export-api";
import {
	parseQCutJianyingProjectExportRequest,
	parseQCutJianyingProjectExportResult,
} from "../types/qcut-jianying-project-export-validation";

function exportedResult(): QCutJianyingProjectExportResult {
	return {
		changed: true,
		contentRelativePath: "subdraft/subdraft-1/draft_content.json",
		contentSha256: "c".repeat(64),
		outcome: "exported",
		patchCount: 4,
		projectDirectory: "/jianying/registered-project",
		projectId: "project-1",
		schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
		schemaVersion: 1,
		subdraftId: "subdraft-1",
		transactionId: "transaction-1",
		warnings: [],
	};
}

describe("Jianying project export wire validation", () => {
	it("accepts a project-only request and rejects path-bearing input", () => {
		expect(
			parseQCutJianyingProjectExportRequest({
				value: { projectId: "project-1" },
			})
		).toEqual({ projectId: "project-1" });
		expect(() =>
			parseQCutJianyingProjectExportRequest({
				value: {
					projectId: "project-1",
					sourceProjectDirectory: "/private/draft",
				},
			})
		).toThrow("unsupported field");
	});

	it("parses exported, blocked, cancelled, and failed results", () => {
		expect(
			parseQCutJianyingProjectExportResult({ value: exportedResult() })
		).toEqual(exportedResult());
		const blocked: QCutJianyingProjectExportResult = {
			issues: [{ code: "WRITEBACK_TRACK_ADDED", message: "Track added." }],
			message: "The edit cannot be represented safely.",
			outcome: "blocked",
			projectId: "project-1",
			reason: "prepare-blocked",
			schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
			schemaVersion: 1,
		};
		expect(parseQCutJianyingProjectExportResult({ value: blocked })).toEqual(
			blocked
		);
		expect(
			parseQCutJianyingProjectExportResult({
				value: { ...blocked, issues: [], reason: "profile-not-writable" },
			})
		).toMatchObject({
			outcome: "blocked",
			reason: "profile-not-writable",
		});
		expect(
			parseQCutJianyingProjectExportResult({
				value: {
					outcome: "cancelled",
					projectId: "project-1",
					schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
					schemaVersion: 1,
				},
			})
		).toMatchObject({ outcome: "cancelled" });
		expect(
			parseQCutJianyingProjectExportResult({
				value: {
					message: "Jianying is running.",
					outcome: "failed",
					projectDirectory: "/jianying/registered-project",
					projectId: "project-1",
					reason: "export-failed",
					schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
					schemaVersion: 1,
				},
			})
		).toMatchObject({ outcome: "failed" });
	});

	it("rejects extra fields, malformed digests, and invalid counts", () => {
		expect(() =>
			parseQCutJianyingProjectExportResult({
				value: { ...exportedResult(), recoveryToken: "not-applicable" },
			})
		).toThrow("unsupported field");
		expect(() =>
			parseQCutJianyingProjectExportResult({
				value: { ...exportedResult(), contentSha256: "invalid" },
			})
		).toThrow("SHA-256");
		expect(() =>
			parseQCutJianyingProjectExportResult({
				value: { ...exportedResult(), patchCount: -1 },
			})
		).toThrow("non-negative integer");
	});
});
