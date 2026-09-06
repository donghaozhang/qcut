// @vitest-environment node
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME } from "../../electron/jianying-filter-local-runtime/bridge-resolver.js";
import {
	JIANYING_DEFLICKER_HOST_FILE_NAME,
	JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS,
} from "../../electron/jianying-basic-video-runtime/bridge-resolver.js";
import { JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME } from "../../electron/jianying-portrait-adjustment-runtime/bridge-resolver.js";
import { JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME } from "../../electron/jianying-person-cutout/bridge-resolver.js";
import { JIANYING_SALIENCY_BRIDGE_FILE_NAME } from "../../electron/jianying-person-cutout/saliency-bridge-resolver.js";
import {
	VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME,
	VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS,
} from "../../electron/jianying-person-cutout/video-object-bach-bridge-resolver.js";
import { VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME } from "../../electron/jianying-person-cutout/video-object-coreml-bridge-resolver.js";
import { JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME } from "../../electron/jianying-text-runtime/bridge-resolver.js";
import { JIANYING_TRANSITION_BRIDGE_FILE_NAME } from "../../electron/jianying-transition/bridge-resolver.js";
import { INDEPENDENT_FILTER_HOST } from "../../electron/qcut-independent-filter/bridge.js";
import { SOFT_GLOW_HOST } from "../../electron/qcut-independent-filter/soft-glow-bridge.js";
import { verifyPackagedJianyingRuntimeBridges } from "../verify-packaged-jianying-runtime-bridges.js";

const temporaryDirectories: string[] = [];

async function writeBridge({
	contents,
	filePath,
}: {
	contents: string;
	filePath: string;
}) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, contents);
	await chmod(filePath, 0o755);
}

async function createFixture({
	deflickerCapabilities = JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS.join(" "),
	personCutoutCapabilities = "TEMattingBlendEffectV2-native-metal-canary Vision-person-fusion-v1",
	saliencyCapabilities = "video-object-general-seg-v1 video-object-alpha-quality-v1",
	videoObjectBachCapabilities = VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS.join(
		" "
	),
	videoObjectCoreMLCapabilities = "video-object-same-model-coreml-v1",
	transitionUsage = "transition-video|effect-video",
}: {
	deflickerCapabilities?: string;
	personCutoutCapabilities?: string;
	saliencyCapabilities?: string;
	videoObjectBachCapabilities?: string;
	videoObjectCoreMLCapabilities?: string;
	transitionUsage?: string;
} = {}) {
	const projectRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-packaged-runtime-bridges-")
	);
	temporaryDirectories.push(projectRoot);
	const distRoot = path.join(projectRoot, "dist-electron");
	const stagedRoot = path.join(projectRoot, "electron", "resources", "bin");
	const packagedRoot = path.join(
		distRoot,
		"mac-arm64",
		"QCut AI Video Editor.app",
		"Contents",
		"Resources",
		"bin"
	);
	const bridges = [
		{
			name: JIANYING_TRANSITION_BRIDGE_FILE_NAME,
			contents: `#!/bin/sh\necho '${transitionUsage}' >&2\nexit 2\n`,
		},
		{
			name: JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME,
			contents: "#!/bin/sh\nexit 0\n",
		},
		{
			name: JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME,
			contents: "#!/bin/sh\nexit 0\n",
		},
		{
			name: JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME,
			contents: "#!/bin/sh\n# HTSGLContext\nexit 0\n",
		},
		{
			name: JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME,
			contents: `#!/bin/sh\n# ${personCutoutCapabilities}\nexit 0\n`,
		},
		{
			name: JIANYING_SALIENCY_BRIDGE_FILE_NAME,
			contents: `#!/bin/sh\n# ${saliencyCapabilities}\nexit 0\n`,
		},
		{
			name: VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME,
			contents: `#!/bin/sh\n# ${videoObjectBachCapabilities}\nexit 0\n`,
		},
		{
			name: VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME,
			contents: `#!/bin/sh\n# ${videoObjectCoreMLCapabilities}\nexit 0\n`,
		},
		{
			name: JIANYING_DEFLICKER_HOST_FILE_NAME,
			contents: `#!/bin/sh\n# ${deflickerCapabilities}\nexit 0\n`,
		},
		{
			name: INDEPENDENT_FILTER_HOST,
			contents: "#!/bin/sh\n# independent-metal-host\nexit 0\n",
		},
		{
			name: SOFT_GLOW_HOST,
			contents: "#!/bin/sh\n# independent-soft-glow-host\nexit 0\n",
		},
	];
	await Promise.all(
		bridges.flatMap(({ name, contents }) => [
			writeBridge({ filePath: path.join(stagedRoot, name), contents }),
			writeBridge({ filePath: path.join(packagedRoot, name), contents }),
		])
	);
	return { distRoot, projectRoot, stagedRoot, packagedRoot };
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("packaged Jianying runtime bridge verification", () => {
	it("accepts all bridges when the transition bridge supports effects", async () => {
		const fixture = await createFixture();
		await expect(
			verifyPackagedJianyingRuntimeBridges(fixture)
		).resolves.toMatchObject({
			transitionBridge: expect.stringContaining(
				JIANYING_TRANSITION_BRIDGE_FILE_NAME
			),
			textBridge: expect.stringContaining(
				JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME
			),
			filterBridge: expect.stringContaining(
				JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME
			),
			portraitAdjustmentHost: expect.stringContaining(
				JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME
			),
			personCutoutBridge: expect.stringContaining(
				JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME
			),
			saliencyBridge: expect.stringContaining(
				JIANYING_SALIENCY_BRIDGE_FILE_NAME
			),
			videoObjectBachBridge: expect.stringContaining(
				VIDEO_OBJECT_BACH_BRIDGE_FILE_NAME
			),
			videoObjectCoreMLBridge: expect.stringContaining(
				VIDEO_OBJECT_COREML_BRIDGE_FILE_NAME
			),
			deflickerHost: expect.stringContaining(JIANYING_DEFLICKER_HOST_FILE_NAME),
			independentFilterHost: expect.stringContaining(INDEPENDENT_FILTER_HOST),
			softGlowHost: expect.stringContaining(SOFT_GLOW_HOST),
		});
	});

	describe.each([INDEPENDENT_FILTER_HOST, SOFT_GLOW_HOST])("%s", (hostName) => {
		it("rejects a helper omitted from the packaged app", async () => {
			const fixture = await createFixture();
			await rm(path.join(fixture.packagedRoot, hostName));
			await expect(
				verifyPackagedJianyingRuntimeBridges(fixture)
			).rejects.toThrow(
				`Packaged Jianying runtime bridge not found under ${fixture.distRoot}: ${hostName}`
			);
		});

		it("rejects a packaged helper that differs from the freshly staged helper", async () => {
			const fixture = await createFixture();
			await writeBridge({
				filePath: path.join(fixture.packagedRoot, hostName),
				contents: "#!/bin/sh\n# stale-independent-helper\nexit 0\n",
			});
			await expect(
				verifyPackagedJianyingRuntimeBridges(fixture)
			).rejects.toThrow(
				`Packaged Jianying runtime bridge differs from the staged binary: ${hostName}`
			);
		});

		it.skipIf(process.platform === "win32")(
			"rejects a packaged helper without executable permissions",
			async () => {
				const fixture = await createFixture();
				const packagedPath = path.join(fixture.packagedRoot, hostName);
				await chmod(packagedPath, 0o644);
				await expect(
					verifyPackagedJianyingRuntimeBridges(fixture)
				).rejects.toThrow(
					`Jianying runtime bridge is not executable: ${packagedPath}`
				);
			}
		);
	});

	it("rejects a deflicker host without the audited execution route", async () => {
		const fixture = await createFixture({
			deflickerCapabilities: JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS[0],
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS[1]
		);
	});

	it("rejects a transition bridge built before effect rendering existed", async () => {
		const fixture = await createFixture({
			transitionUsage: "transition-video|text-frame",
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			"required mode: effect-video"
		);
	});

	it("rejects a video-object bridge without the Alpha quality gate", async () => {
		const fixture = await createFixture({
			saliencyCapabilities: "video-object-general-seg-v1",
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			"video-object Alpha quality gate"
		);
	});

	it("rejects a stale same-model CoreML bridge", async () => {
		const fixture = await createFixture({
			videoObjectCoreMLCapabilities: "video-object-alpha-quality-v1",
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			"same-model CoreML bridge is stale"
		);
	});

	it("rejects a Bach bridge without every audited runtime pin", async () => {
		const fixture = await createFixture({
			videoObjectBachCapabilities:
				"video-object-jianying-bach-v2-exact-d634-v1 TEMattingBlendEffectV2-vendor-exact D6342ECD-5432-33F0-A2AD-0C28F5699994",
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			"missing audited capability"
		);
	});

	it("rejects a Bach bridge without the pinned dependency closure", async () => {
		const fixture = await createFixture({
			videoObjectBachCapabilities:
				VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS.filter(
					(marker) => !marker.startsWith("jianying-runtime-framework-closure-")
				).join(" "),
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			"missing audited capability"
		);
	});

	it("rejects a person bridge that still claims full native Metal blending", async () => {
		const fixture = await createFixture({
			personCutoutCapabilities:
				"TEMattingBlendEffectV2-native-metal Vision-person-fusion-v1",
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			"native Metal canary validation"
		);
	});
});
