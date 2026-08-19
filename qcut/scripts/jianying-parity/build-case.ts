// Generates JianYing parity case drafts (L1) into the local workspace and,
// with --register, into 剪映专业版's draft folder for ground-truth export.
//
//   bun scripts/jianying-parity/build-case.ts --case transform-rotation
//   bun scripts/jianying-parity/build-case.ts --case all --register
//
// Everything stays in .local/jianying-parity/ (gitignored). Registered draft
// folders are named QCUT-PARITY-<case>-<variant> so they are unmistakable and
// disposable inside 剪映. Export instructions are printed at the end — do the
// exports on the secondary screen, never on the user's working screen.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	getBundledTargetKey,
	resolveBundledToolPath,
	runCommand,
} from "../capcut-e2e/runtime.js";
import {
	buildParityDraftContent,
	getParityCase,
	PARITY_CANVAS_HEIGHT,
	PARITY_CANVAS_WIDTH,
	PARITY_CASES,
	PARITY_DURATION_US,
	PARITY_FPS,
	type ParityVariant,
} from "./draft-case.js";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const WORKSPACE = join(REPO_ROOT, ".local/jianying-parity");
const ASSET_PATH = join(WORKSPACE, "_assets/parity-plate.mp4");
const JIANYING_DRAFT_ROOT = join(
	homedir(),
	"Movies",
	"JianyingPro",
	"User Data",
	"Projects",
	"com.lveditor.draft"
);
const VARIANTS: readonly ParityVariant[] = ["on", "off"];

function parseArgs() {
	const args = { caseId: "", register: false };
	const argv = process.argv.slice(2);
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === "--case") {
			args.caseId = argv[index + 1] ?? "";
			index += 1;
		} else if (argv[index] === "--register") {
			args.register = true;
		} else {
			throw new Error(`Unknown argument: ${argv[index]}`);
		}
	}
	if (!args.caseId) {
		throw new Error(
			`Usage: bun scripts/jianying-parity/build-case.ts --case <id|all> [--register]\nCases: ${PARITY_CASES.map(({ id }) => id).join(", ")}`
		);
	}
	return args;
}

/**
 * A deterministic, spatially asymmetric plate: gradient test pattern plus two
 * different corner marks, so rotation/flip/translate/scale all move visible
 * structure. Regenerated only when missing.
 */
async function ensurePlateAsset() {
	if (existsSync(ASSET_PATH)) return;
	await mkdir(join(WORKSPACE, "_assets"), { recursive: true });
	const ffmpegPath = await resolveBundledToolPath({
		projectRoot: REPO_ROOT,
		targetKey: getBundledTargetKey(),
		tool: "ffmpeg",
	});
	const seconds = PARITY_DURATION_US / 1_000_000;
	const filter = [
		`testsrc2=size=${PARITY_CANVAS_WIDTH}x${PARITY_CANVAS_HEIGHT}:rate=${PARITY_FPS}:duration=${seconds}`,
		"drawbox=x=10:y=10:w=60:h=60:color=red@1:t=fill",
		"drawbox=x=iw-40:y=ih-40:w=30:h=30:color=white@1:t=fill",
		"format=yuv420p",
	].join(",");
	await runCommand({
		command: ffmpegPath,
		args: [
			"-y",
			"-f",
			"lavfi",
			"-i",
			filter,
			"-c:v",
			"libx264",
			"-qp",
			"10",
			"-g",
			"1",
			ASSET_PATH,
		],
	});
	console.log(`plate asset: ${ASSET_PATH}`);
}

async function writeCaseDrafts({ caseId }: { caseId: string }) {
	const caseDirectory = join(WORKSPACE, "cases", caseId);
	const manifest: Record<string, unknown> = {
		schema: "qcut.jianying-parity.case/1",
		caseId,
		description: getParityCase({ caseId }).description,
		assetPath: ASSET_PATH,
		drafts: {} as Record<string, unknown>,
	};
	for (const variant of VARIANTS) {
		const content = buildParityDraftContent({
			caseId,
			variant,
			assetPath: ASSET_PATH,
		});
		const serialized = JSON.stringify(content);
		const draftDirectory = join(caseDirectory, variant);
		await mkdir(draftDirectory, { recursive: true });
		await writeFile(
			join(draftDirectory, "draft_content.json"),
			serialized,
			"utf8"
		);
		(manifest.drafts as Record<string, unknown>)[variant] = {
			path: join(draftDirectory, "draft_content.json"),
			sha256: createHash("sha256").update(serialized).digest("hex"),
			byteLength: Buffer.byteLength(serialized),
		};
	}
	await writeFile(
		join(caseDirectory, "case-manifest.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
		"utf8"
	);
	return caseDirectory;
}

async function registerCaseDrafts({ caseId }: { caseId: string }) {
	if (!existsSync(JIANYING_DRAFT_ROOT)) {
		throw new Error(`剪映草稿目录不存在:${JIANYING_DRAFT_ROOT}`);
	}
	for (const variant of VARIANTS) {
		const source = join(WORKSPACE, "cases", caseId, variant);
		const target = join(
			JIANYING_DRAFT_ROOT,
			`QCUT-PARITY-${caseId}-${variant}`
		);
		await cp(source, target, { recursive: true });
		console.log(`registered: ${target}`);
	}
}

async function main() {
	const { caseId, register } = parseArgs();
	const caseIds =
		caseId === "all"
			? PARITY_CASES.map(({ id }) => id)
			: [getParityCase({ caseId }).id];
	await ensurePlateAsset();
	for (const id of caseIds) {
		const directory = await writeCaseDrafts({ caseId: id });
		console.log(`case drafts: ${directory}`);
		if (register) {
			await registerCaseDrafts({ caseId: id });
		}
	}
	console.log(`
下一步(在副屏的剪映专业版里,勿动主屏):
1. 重启剪映让它扫描到 QCUT-PARITY-* 草稿(如未出现,检查是否需要迁移确认弹窗)。
2. 逐个打开草稿,不做任何修改,导出为与草稿同分辨率/帧率的视频。
3. 导出文件命名并放入对应 case 目录:
   .local/jianying-parity/cases/<case>/jianying-on.mp4
   .local/jianying-parity/cases/<case>/jianying-off.mp4
4. QCut 侧:导入 cases/<case>/{on,off}/draft_content.json 并导出,得到
   qcut-on.mp4 / qcut-off.mp4 放同一目录。
5. 比对:bun scripts/jianying-parity/compare.ts --case <case>
注意:本机剪映为 11.3.0-beta5(打开 beta4 明文草稿依赖其迁移能力);
receipt 会记录实际导出的 app 版本。所有产物都留在 .local/,不进 Git。`);
}

await main();
