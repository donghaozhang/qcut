// @vitest-environment node
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JIANYING_FILTER_LOCAL_BRIDGE_FILE_NAME } from "../../electron/jianying-filter-local-runtime/bridge-resolver.js";
import { JIANYING_PORTRAIT_ADJUSTMENT_HOST_FILE_NAME } from "../../electron/jianying-portrait-adjustment-runtime/bridge-resolver.js";
import { JIANYING_PERSON_CUTOUT_BRIDGE_FILE_NAME } from "../../electron/jianying-person-cutout/bridge-resolver.js";
import { JIANYING_SALIENCY_BRIDGE_FILE_NAME } from "../../electron/jianying-person-cutout/saliency-bridge-resolver.js";
import { JIANYING_TEXT_RUNTIME_BRIDGE_FILE_NAME } from "../../electron/jianying-text-runtime/bridge-resolver.js";
import { JIANYING_TRANSITION_BRIDGE_FILE_NAME } from "../../electron/jianying-transition/bridge-resolver.js";
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
	transitionUsage = "transition-video|effect-video",
}: {
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
			contents:
				"#!/bin/sh\n# TEMattingBlendEffectV2-native-metal Vision-person-fusion-v1\nexit 0\n",
		},
		{
			name: JIANYING_SALIENCY_BRIDGE_FILE_NAME,
			contents: "#!/bin/sh\n# video-object-general-seg-v1\nexit 0\n",
		},
	];
	await Promise.all(
		bridges.flatMap(({ name, contents }) => [
			writeBridge({ filePath: path.join(stagedRoot, name), contents }),
			writeBridge({ filePath: path.join(packagedRoot, name), contents }),
		])
	);
	return { distRoot, projectRoot };
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
		});
	});

	it("rejects a transition bridge built before effect rendering existed", async () => {
		const fixture = await createFixture({
			transitionUsage: "transition-video|text-frame",
		});
		await expect(verifyPackagedJianyingRuntimeBridges(fixture)).rejects.toThrow(
			"required mode: effect-video"
		);
	});
});
