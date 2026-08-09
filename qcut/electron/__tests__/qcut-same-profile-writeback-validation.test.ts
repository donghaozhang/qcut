import { describe, expect, it } from "vitest";
import {
	QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
	type QCutSameProfileWritebackResult,
} from "../types/qcut-same-profile-writeback-api";
import {
	parseQCutSameProfileWritebackRequest,
	parseQCutSameProfileWritebackResult,
} from "../types/qcut-same-profile-writeback-validation";

const PROJECT_ID = "project-1";

function writtenResult(): QCutSameProfileWritebackResult {
	return {
		contentSha256: "c".repeat(64),
		operation: "writeback",
		outcome: "written",
		projectId: PROJECT_ID,
		replacedMirrorCount: 4,
		schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
		schemaVersion: 1,
		transactionId: "transaction-1",
		warnings: [],
	};
}

describe("same-profile writeback wire validation", () => {
	it("parses exact writeback and recovery requests", () => {
		expect(
			parseQCutSameProfileWritebackRequest({
				value: { action: "writeback", projectId: PROJECT_ID },
			})
		).toEqual({ action: "writeback", projectId: PROJECT_ID });
		expect(
			parseQCutSameProfileWritebackRequest({
				value: { action: "recover", recoveryToken: "selection-1" },
			})
		).toEqual({ action: "recover", recoveryToken: "selection-1" });
	});

	it("rejects path-bearing or mixed request fields", () => {
		expect(() =>
			parseQCutSameProfileWritebackRequest({
				value: {
					action: "writeback",
					projectId: PROJECT_ID,
					draftDirectory: "/private/draft",
				},
			})
		).toThrow("unsupported field");
		expect(() =>
			parseQCutSameProfileWritebackRequest({
				value: {
					action: "recover",
					projectId: PROJECT_ID,
					recoveryToken: "selection-1",
				},
			})
		).toThrow("unsupported field");
	});

	it("parses pathless written and blocked results", () => {
		expect(
			parseQCutSameProfileWritebackResult({ value: writtenResult() })
		).toEqual(writtenResult());

		const blocked: QCutSameProfileWritebackResult = {
			issues: [
				{
					code: "WRITEBACK_TRACK_ADDED",
					message: "A track was added.",
					semanticId: "track-1",
				},
			],
			message: "The current edit cannot be written safely.",
			operation: "writeback",
			outcome: "blocked",
			projectId: PROJECT_ID,
			reason: "prepare-blocked",
			schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
			schemaVersion: 1,
		};
		expect(parseQCutSameProfileWritebackResult({ value: blocked })).toEqual(
			blocked
		);
	});

	it("parses recovery and bounded failure tokens", () => {
		const recovered: QCutSameProfileWritebackResult = {
			operation: "recover",
			outcome: "recovered",
			recoveryAction: "rolled-back",
			schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
			schemaVersion: 1,
			transactionId: "transaction-1",
			warnings: [],
		};
		expect(parseQCutSameProfileWritebackResult({ value: recovered })).toEqual(
			recovered
		);

		const failed: QCutSameProfileWritebackResult = {
			message: "Recovery is required.",
			operation: "writeback",
			outcome: "failed",
			projectId: PROJECT_ID,
			reason: "writeback-failed",
			recoveryToken: "selection-1",
			schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
			schemaVersion: 1,
		};
		expect(parseQCutSameProfileWritebackResult({ value: failed })).toEqual(
			failed
		);
	});

	it("rejects path-bearing results and invalid mirror counts", () => {
		expect(() =>
			parseQCutSameProfileWritebackResult({
				value: { ...writtenResult(), draftDirectory: "/private/draft" },
			})
		).toThrow("unsupported field");
		expect(() =>
			parseQCutSameProfileWritebackResult({
				value: { ...writtenResult(), replacedMirrorCount: 3 },
			})
		).toThrow("four mirrors");
	});
});
