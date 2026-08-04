import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	parseQCutImportVerificationCliOptions,
	QCUT_IMPORT_VERIFICATION_MANIFEST_FILE_NAME,
	runQCutImportVerification,
} from "../capcut-e2e/qcut-import-verification.js";

const NOW = "2026-08-05T00:00:00.000Z";
const DIGEST_PLACEHOLDER = "0".repeat(64);
const PERSISTED_IMPORT_EVIDENCE_SCHEMA =
	"qcut.draft-interop.persisted-import-evidence" as const;
const VIDEO_RESOURCE_ID = "video-resource";
const VIDEO_ELEMENT_ID = "video-element";
const VIDEO_TRACK_ID = "video-track";
const TEXT_ELEMENT_ID = "text-element";
const TEXT_TRACK_ID = "text-track";
const INTERNAL_VIDEO_RESOURCE_ID = "internal-video-resource";
const INTERNAL_VIDEO_ELEMENT_ID = "internal-video-element";
const INTERNAL_VIDEO_TRACK_ID = "internal-video-track";
const INTERNAL_TEXT_ELEMENT_ID = "internal-text-element";
const INTERNAL_TEXT_TRACK_ID = "internal-text-track";
const SOURCE_MEDIA_BYTES = Buffer.from("qcut-import-media");

let rootDirectory: string;

beforeEach(async () => {
	rootDirectory = await mkdtemp(
		join(tmpdir(), "qcut-import-verification-test-")
	);
});

afterEach(async () => {
	await rm(rootDirectory, { force: true, recursive: true });
});

function sortValueDeep({ value }: { value: unknown }): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => sortValueDeep({ value: entry }));
	}
	if (typeof value !== "object" || value === null) return value;
	const record = value as Record<string, unknown>;
	return Object.fromEntries(
		Object.keys(record)
			.sort()
			.map((key) => [key, sortValueDeep({ value: record[key] })])
	);
}

function calculateBundleDigest<T extends { bundleDigest: string }>({
	bundle,
}: {
	bundle: T;
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify(
				sortValueDeep({
					value: { ...bundle, bundleDigest: DIGEST_PLACEHOLDER },
				})
			)
		)
		.digest("hex");
}

function createBundle() {
	const bundle = {
		schemaVersion: 1 as const,
		bundleDigest: DIGEST_PLACEHOLDER,
		planToken: "plan-token",
		buildIdentity: { appVersion: "test", interopSchemaVersion: 1 },
		createdAtUnixMilliseconds: 1,
		conflictPolicy: { projectName: "fail" as const },
		document: {
			schemaVersion: 1 as const,
			timeUnit: "microseconds" as const,
			source: {
				product: "capcut" as const,
				profileId: "capcut-desktop-8.1-plaintext",
				platform: "macos" as const,
				files: [],
			},
			project: {
				id: "source-project",
				name: "Imported Project",
				width: 1920,
				height: 1080,
				fps: 30,
			},
			timelines: [
				{
					id: "root",
					isRoot: true,
					tracks: [
						{
							id: VIDEO_TRACK_ID,
							kind: "video" as const,
							order: 0,
							isMain: true,
							capability: "exact" as const,
							segments: [
								{
									id: VIDEO_ELEMENT_ID,
									kind: "video" as const,
									resourceId: VIDEO_RESOURCE_ID,
									sourceRange: {
										startUs: 500_000,
										durationUs: 5_000_000,
									},
									targetRange: {
										startUs: 0,
										durationUs: 5_000_000,
									},
									capability: "exact" as const,
								},
							],
						},
						{
							id: TEXT_TRACK_ID,
							kind: "text" as const,
							order: 1,
							capability: "exact" as const,
							segments: [
								{
									id: TEXT_ELEMENT_ID,
									kind: "text" as const,
									targetRange: {
										startUs: 1_000_000,
										durationUs: 2_000_000,
									},
									text: {
										content: "Hello",
										fontSizePx: 64,
										fontFamily: "Arial",
										color: "#ffffff",
										textAlign: "center" as const,
										fontWeight: "normal" as const,
										fontStyle: "normal" as const,
										textDecoration: "none" as const,
										xPx: 0,
										yPx: 0,
										rotationDegrees: 0,
										opacity: 1,
									},
									capability: "exact" as const,
								},
							],
						},
					],
				},
			],
			resources: [
				{
					id: VIDEO_RESOURCE_ID,
					kind: "video" as const,
					name: "clip.mp4",
					sha256: createHash("sha256").update(SOURCE_MEDIA_BYTES).digest("hex"),
					byteLength: SOURCE_MEDIA_BYTES.length,
					durationUs: 6_000_000,
					status: "resolved" as const,
					capability: "exact" as const,
				},
			],
			links: [],
			issues: [],
		},
		timelinePlan: {
			schemaVersion: 1 as const,
			project: {
				name: "Imported Project",
				width: 1920,
				height: 1080,
				fps: 30,
			},
			tracks: [
				{
					id: VIDEO_TRACK_ID,
					type: "media" as const,
					name: "Video",
					order: 0,
					isMain: true,
					elements: [
						{
							id: VIDEO_ELEMENT_ID,
							type: "media" as const,
							name: "clip.mp4",
							startTime: 0,
							duration: 6,
							trimStart: 0.5,
							trimEnd: 0.5,
							resourceId: VIDEO_RESOURCE_ID,
							sourceSegmentId: VIDEO_ELEMENT_ID,
						},
					],
					sourceTrackId: VIDEO_TRACK_ID,
				},
				{
					id: TEXT_TRACK_ID,
					type: "text" as const,
					name: "Text",
					order: 1,
					elements: [
						{
							id: TEXT_ELEMENT_ID,
							type: "text" as const,
							name: "Hello",
							startTime: 1,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
							content: "Hello",
							fontSize: 64,
							fontFamily: "Arial",
							color: "#ffffff",
							backgroundColor: "transparent",
							textAlign: "center" as const,
							fontWeight: "normal" as const,
							fontStyle: "normal" as const,
							textDecoration: "none" as const,
							x: 0,
							y: 0,
							rotation: 0,
							opacity: 1,
							sourceSegmentId: TEXT_ELEMENT_ID,
						},
					],
					sourceTrackId: TEXT_TRACK_ID,
				},
			],
			resourceIds: [VIDEO_RESOURCE_ID],
			skipped: [],
		},
		resourceStaging: [
			{
				resourceId: VIDEO_RESOURCE_ID,
				stagingKey: "video-resource",
				kind: "video" as const,
				status: "resolved" as const,
				byteLength: SOURCE_MEDIA_BYTES.length,
				sha256: createHash("sha256").update(SOURCE_MEDIA_BYTES).digest("hex"),
			},
		],
		internalIdBySemanticId: {
			[VIDEO_RESOURCE_ID]: INTERNAL_VIDEO_RESOURCE_ID,
			[VIDEO_ELEMENT_ID]: INTERNAL_VIDEO_ELEMENT_ID,
			[VIDEO_TRACK_ID]: INTERNAL_VIDEO_TRACK_ID,
			[TEXT_ELEMENT_ID]: INTERNAL_TEXT_ELEMENT_ID,
			[TEXT_TRACK_ID]: INTERNAL_TEXT_TRACK_ID,
		},
	};
	bundle.bundleDigest = calculateBundleDigest({ bundle });
	return bundle;
}

function createManualSnapshot({ mediaPath }: { mediaPath: string }) {
	return {
		schemaVersion: 1,
		project: {
			id: "qcut-project",
			name: "Imported Project",
			width: 1920,
			height: 1080,
			fps: 30,
		},
		tracks: [
			{
				id: INTERNAL_VIDEO_TRACK_ID,
				name: "Video",
				type: "media",
				elements: [
					{
						id: INTERNAL_VIDEO_ELEMENT_ID,
						type: "media",
						mediaId: INTERNAL_VIDEO_RESOURCE_ID,
						name: "clip.mp4",
						duration: 6,
						startTime: 0,
						trimStart: 0.5,
						trimEnd: 0.5,
					},
				],
				order: 0,
				isMain: true,
			},
			{
				id: INTERNAL_TEXT_TRACK_ID,
				name: "Text",
				type: "text",
				elements: [
					{
						id: INTERNAL_TEXT_ELEMENT_ID,
						type: "text",
						name: "Hello",
						duration: 2,
						startTime: 1,
						trimStart: 0,
						trimEnd: 0,
						content: "Hello",
						fontSize: 64,
						fontFamily: "Arial",
						color: "#ffffff",
						backgroundColor: "transparent",
						textAlign: "center",
						fontWeight: "normal",
						fontStyle: "normal",
						textDecoration: "none",
						x: 0,
						y: 0,
						rotation: 0,
						opacity: 1,
					},
				],
				order: 1,
			},
		],
		media: [
			{
				id: INTERNAL_VIDEO_RESOURCE_ID,
				name: "clip.mp4",
				type: "video",
				sourcePath: mediaPath,
				duration: 5,
				width: 1920,
				height: 1080,
			},
		],
	};
}

function createTrustedSnapshot({
	bundle,
}: {
	bundle: ReturnType<typeof createBundle>;
}) {
	const manual = createManualSnapshot({ mediaPath: "/unused" });
	return {
		binding: {
			bundleDigest: bundle.bundleDigest,
			importId: bundle.planToken,
			profileId: bundle.document.source.profileId,
		},
		capture: {
			appVersion: "2026.08.05.1",
			capturedAtIso: NOW,
			readPasses: 2 as const,
			source: "qcut-renderer-persisted-storage" as const,
		},
		media: [
			{
				byteLength: SOURCE_MEDIA_BYTES.length,
				id: INTERNAL_VIDEO_RESOURCE_ID,
				sha256: createHash("sha256").update(SOURCE_MEDIA_BYTES).digest("hex"),
				type: "video" as const,
			},
		],
		project: {
			...manual.project,
			id: "qcut-project",
			sceneId: "qcut-main-scene",
		},
		schema: PERSISTED_IMPORT_EVIDENCE_SCHEMA,
		schemaVersion: 1 as const,
		tracks: manual.tracks,
	};
}

async function writeVerificationCase() {
	const bundlePath = join(rootDirectory, "import-bundle.json");
	const mediaPath = join(rootDirectory, "clip.mp4");
	const snapshotPath = join(rootDirectory, "qcut-snapshot.json");
	const outputDirectory = join(rootDirectory, "evidence");
	const bundle = createBundle();
	const snapshot = createTrustedSnapshot({ bundle });
	await Promise.all([
		writeFile(bundlePath, JSON.stringify(bundle)),
		writeFile(mediaPath, SOURCE_MEDIA_BYTES),
		writeFile(snapshotPath, JSON.stringify(snapshot)),
		mkdir(outputDirectory),
	]);
	return {
		bundle,
		bundlePath,
		mediaPath,
		outputDirectory,
		snapshot,
		snapshotPath,
	};
}

describe("QCut import verification E2E evidence", () => {
	it("passes exact persisted media and timeline state without leaking paths", async () => {
		const testCase = await writeVerificationCase();
		const manifest = await runQCutImportVerification({
			bundlePath: testCase.bundlePath,
			nowIso: NOW,
			outputDirectory: testCase.outputDirectory,
			qcutSnapshotPath: testCase.snapshotPath,
		});

		expect(manifest).toMatchObject({
			capture: {
				appVersion: "2026.08.05.1",
				source: "qcut-renderer-persisted-storage",
			},
			checks: {
				bundleDigest: true,
				captureTrusted: true,
				importId: true,
				profileId: true,
				projectFps: true,
				projectGeometry: true,
				projectName: true,
			},
			verification: { issues: [], verdict: "pass" },
			verdict: "pass",
		});
		const written = await readFile(
			join(
				testCase.outputDirectory,
				QCUT_IMPORT_VERIFICATION_MANIFEST_FILE_NAME
			),
			"utf8"
		);
		expect(written).not.toContain(rootDirectory);
		expect(JSON.parse(written)).toEqual(JSON.parse(JSON.stringify(manifest)));
	});

	it("fails when persisted timeline state differs", async () => {
		const testCase = await writeVerificationCase();
		testCase.snapshot.tracks[0].elements[0].startTime = 0.25;
		await writeFile(testCase.snapshotPath, JSON.stringify(testCase.snapshot));

		const manifest = await runQCutImportVerification({
			bundlePath: testCase.bundlePath,
			nowIso: NOW,
			qcutSnapshotPath: testCase.snapshotPath,
		});

		expect(manifest.verdict).toBe("fail");
		expect(manifest.verification?.issues).toContainEqual({
			code: "TRACK_MISMATCH",
			path: `/tracks/${INTERNAL_VIDEO_TRACK_ID}`,
		});
	});

	it("fails when persisted media bytes differ", async () => {
		const testCase = await writeVerificationCase();
		testCase.snapshot.media[0].sha256 = "c".repeat(64);
		await writeFile(testCase.snapshotPath, JSON.stringify(testCase.snapshot));

		const manifest = await runQCutImportVerification({
			bundlePath: testCase.bundlePath,
			nowIso: NOW,
			qcutSnapshotPath: testCase.snapshotPath,
		});

		expect(manifest.verdict).toBe("fail");
		expect(manifest.verification?.issues).toContainEqual({
			code: "MEDIA_MISMATCH",
			path: `/media/${INTERNAL_VIDEO_RESOURCE_ID}`,
		});
	});

	it.each([
		{
			check: "bundleDigest",
			field: "bundleDigest",
			value: "b".repeat(64),
		},
		{ check: "importId", field: "importId", value: "wrong-import-id" },
		{ check: "profileId", field: "profileId", value: "wrong-profile" },
	] as const)("fails when trusted $field binding differs", async ({
		check,
		field,
		value,
	}) => {
		const testCase = await writeVerificationCase();
		const snapshot = {
			...testCase.snapshot,
			binding: { ...testCase.snapshot.binding, [field]: value },
		};
		await writeFile(testCase.snapshotPath, JSON.stringify(snapshot));

		const manifest = await runQCutImportVerification({
			bundlePath: testCase.bundlePath,
			nowIso: NOW,
			qcutSnapshotPath: testCase.snapshotPath,
		});

		expect(manifest.checks[check]).toBe(false);
		expect(manifest.verdict).toBe("fail");
	});

	it("keeps a matching manual path snapshot diagnostic-only", async () => {
		const testCase = await writeVerificationCase();
		await writeFile(
			testCase.snapshotPath,
			JSON.stringify(createManualSnapshot({ mediaPath: testCase.mediaPath }))
		);

		const manifest = await runQCutImportVerification({
			bundlePath: testCase.bundlePath,
			nowIso: NOW,
			qcutSnapshotPath: testCase.snapshotPath,
		});

		expect(manifest).toMatchObject({
			capture: { source: "manual-path-snapshot" },
			checks: { captureTrusted: false },
			notComparableReason:
				"Snapshot was not captured from trusted QCut persisted storage.",
			verification: { issues: [], verdict: "pass" },
			verdict: "not-comparable",
		});
		expect(JSON.stringify(manifest)).not.toContain(rootDirectory);
	});

	it("writes path-free not-comparable evidence for digest and snapshot failures", async () => {
		const digestCase = await writeVerificationCase();
		digestCase.bundle.createdAtUnixMilliseconds += 1;
		await writeFile(digestCase.bundlePath, JSON.stringify(digestCase.bundle));
		const digestManifest = await runQCutImportVerification({
			bundlePath: digestCase.bundlePath,
			nowIso: NOW,
			outputDirectory: digestCase.outputDirectory,
			qcutSnapshotPath: digestCase.snapshotPath,
		});
		expect(digestManifest).toMatchObject({
			checks: { bundleDigest: false },
			notComparableReason: "Import bundle digest does not match its content.",
			verdict: "not-comparable",
		});
		const written = await readFile(
			join(
				digestCase.outputDirectory,
				QCUT_IMPORT_VERIFICATION_MANIFEST_FILE_NAME
			),
			"utf8"
		);
		expect(written).not.toContain(rootDirectory);

		const invalidDirectory = join(rootDirectory, "invalid-evidence");
		await mkdir(invalidDirectory);
		await writeFile(digestCase.bundlePath, JSON.stringify(createBundle()));
		await writeFile(
			digestCase.snapshotPath,
			JSON.stringify({ schemaVersion: 1 })
		);
		const invalidManifest = await runQCutImportVerification({
			bundlePath: digestCase.bundlePath,
			nowIso: NOW,
			outputDirectory: invalidDirectory,
			qcutSnapshotPath: digestCase.snapshotPath,
		});
		expect(invalidManifest).toMatchObject({
			checks: { bundleDigest: false },
			notComparableReason: "QCut renderer snapshot failed validation.",
			verdict: "not-comparable",
		});
	});
});

describe("parseQCutImportVerificationCliOptions", () => {
	it("parses the complete command", () => {
		expect(
			parseQCutImportVerificationCliOptions({
				argv: [
					"--json",
					"--bundle",
					"/case/bundle.json",
					"--qcut-snapshot",
					"/case/snapshot.json",
					"--output",
					"/case/evidence",
				],
			})
		).toEqual({
			bundlePath: "/case/bundle.json",
			json: true,
			outputDirectory: "/case/evidence",
			qcutSnapshotPath: "/case/snapshot.json",
		});
	});

	it("rejects missing, duplicate, and unknown flags", () => {
		expect(() =>
			parseQCutImportVerificationCliOptions({ argv: ["--bundle", "bundle"] })
		).toThrow("Missing required flag: --qcut-snapshot");
		expect(() =>
			parseQCutImportVerificationCliOptions({
				argv: ["--bundle", "first", "--bundle", "second"],
			})
		).toThrow("Duplicate flag: --bundle");
		expect(() =>
			parseQCutImportVerificationCliOptions({ argv: ["--wat"] })
		).toThrow("Unknown flag: --wat");
	});
});
