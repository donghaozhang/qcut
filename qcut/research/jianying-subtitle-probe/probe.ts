import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type ExecutionLocality = "local" | "cloud" | "hybrid" | "unresolved";

interface PathEvidence {
	kind: "path";
	label: string;
	path: string;
	required: boolean;
	found: boolean;
	sizeBytes?: number;
}

interface TextEvidence {
	kind: "localized-text";
	label: string;
	pattern: string;
	found: boolean;
	excerpt?: string;
}

interface SymbolEvidence {
	kind: "symbol";
	label: string;
	library: string;
	pattern: string;
	found: boolean;
}

type Evidence = PathEvidence | TextEvidence | SymbolEvidence;

interface SubtitleCapabilityProbe {
	id:
		| "recognize-subtitles"
		| "recognize-lyrics"
		| "subtitle-translation"
		| "subtitle-template"
		| "smart-caption-packaging";
	name: string;
	locality: ExecutionLocality;
	confidence: "confirmed" | "strong" | "partial" | "unavailable";
	evidence: Evidence[];
	conclusion: string;
}

type SubtitleCapabilityInput = Omit<SubtitleCapabilityProbe, "confidence">;

interface ProbeOptions {
	appPath: string;
	userDataPath: string;
}

interface CliArgs {
	appPath?: string;
	userDataPath?: string;
}

const DEFAULT_APP_PATH = "/Applications/VideoFusion-macOS.app";
const DEFAULT_USER_DATA_PATH = join(homedir(), "Movies/JianyingPro/User Data");

const LOCAL_ASR_SUPPLY_FILES = [
	"asr-model-encoder.onnx",
	"asr-model-classifier.onnx",
	"asr-punc.onnx",
	"asr-itn-fst.fst",
	"strategy.json",
];

function readOptionalTextFile({ path }: { path: string }): string {
	if (!existsSync(path)) {
		return "";
	}
	return readFileSync(path, "utf8");
}

function directoryContainsFiles({
	path,
	fileNames,
}: {
	path: string;
	fileNames: string[];
}): boolean {
	if (!existsSync(path)) {
		return false;
	}
	const entries = readdirSync(path, { recursive: true, withFileTypes: true });
	const seen = new Set<string>();
	for (const entry of entries) {
		if (entry.isFile()) {
			seen.add(entry.name);
		}
	}
	return fileNames.every((fileName) => seen.has(fileName));
}

function pathEvidence({
	label,
	path,
	required,
}: {
	label: string;
	path: string;
	required: boolean;
}): PathEvidence {
	if (!existsSync(path)) {
		return {
			kind: "path",
			label,
			path,
			required,
			found: false,
		};
	}
	return {
		kind: "path",
		label,
		path,
		required,
		found: true,
		sizeBytes: statSync(path).size,
	};
}

function textEvidence({
	label,
	pattern,
	text,
}: {
	label: string;
	pattern: string;
	text: string;
}): TextEvidence {
	const match = text.match(new RegExp(pattern, "u"));
	return {
		kind: "localized-text",
		label,
		pattern,
		found: Boolean(match),
		excerpt: match?.[0],
	};
}

function demangleSymbols({ libraryPath }: { libraryPath: string }): string {
	if (!existsSync(libraryPath)) {
		return "";
	}
	const nmResult = spawnSync("nm", ["-gU", libraryPath], {
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	if (nmResult.status !== 0) {
		return "";
	}
	const cxxfiltResult = spawnSync("c++filt", {
		encoding: "utf8",
		input: nmResult.stdout,
		maxBuffer: 32 * 1024 * 1024,
	});
	return cxxfiltResult.status === 0 ? cxxfiltResult.stdout : nmResult.stdout;
}

function symbolEvidence({
	label,
	library,
	pattern,
	symbols,
}: {
	label: string;
	library: string;
	pattern: string;
	symbols: string;
}): SymbolEvidence {
	return {
		kind: "symbol",
		label,
		library,
		pattern,
		found: new RegExp(pattern, "u").test(symbols),
	};
}

function requiredEvidenceFound({
	evidence,
}: {
	evidence: Evidence[];
}): boolean {
	return evidence.every((item) => {
		if (item.kind !== "path") {
			return item.found;
		}
		return item.found || !item.required;
	});
}

export function confidenceFor({
	evidence,
}: {
	evidence: Evidence[];
}): SubtitleCapabilityProbe["confidence"] {
	if (!requiredEvidenceFound({ evidence })) {
		return "unavailable";
	}
	const foundCount = evidence.filter(({ found }) => found).length;
	if (foundCount === evidence.length) {
		return "confirmed";
	}
	return foundCount >= Math.ceil(evidence.length / 2) ? "strong" : "partial";
}

function buildProbe({ appPath, userDataPath }: ProbeOptions) {
	const resourcesPath = join(appPath, "Contents/Resources");
	const frameworksPath = join(appPath, "Contents/Frameworks");
	const localizedText = readOptionalTextFile({
		path: join(resourcesPath, "po/zh-Hans.po"),
	});
	const videoEditorSymbols = demangleSymbols({
		libraryPath: join(frameworksPath, "libvideoeditor.dylib"),
	});
	const speechSymbols = demangleSymbols({
		libraryPath: join(frameworksPath, "libspeechsdk.dylib"),
	});
	const localAsrPath = join(userDataPath, "SupplysStore/local-asr-supplies");
	const hasLocalAsrSupplies = directoryContainsFiles({
		path: localAsrPath,
		fileNames: LOCAL_ASR_SUPPLY_FILES,
	});
	const capabilities: SubtitleCapabilityInput[] = [
		{
			id: "recognize-subtitles",
			name: "识别字幕",
			locality: "hybrid",
			evidence: [
				pathEvidence({
					label: "speech SDK",
					path: join(frameworksPath, "libspeechsdk.dylib"),
					required: true,
				}),
				{
					kind: "path",
					label: "downloaded local ASR supplies",
					path: localAsrPath,
					required: false,
					found: hasLocalAsrSupplies,
				},
				textEvidence({
					label: "recognition quota requires login",
					pattern: "识别字幕及识别歌词功能，导出时扣除",
					text: localizedText,
				}),
				textEvidence({
					label: "network failure can block caption export",
					pattern: "网络异常，该草稿中所含有的字幕结果无法读取",
					text: localizedText,
				}),
				textEvidence({
					label: "VPN/account gates subtitle feature",
					pattern: "请检查关闭VPN环境后重试|账号因封禁，暂时无法使用字幕功能",
					text: localizedText,
				}),
				symbolEvidence({
					label: "caption postprocess engine",
					library: "libspeechsdk.dylib",
					pattern: "CaptionPostProcessActor|UniversalAsr",
					symbols: speechSymbols,
				}),
			],
			conclusion:
				"本机存在可下载离线 ASR 供给和 speech SDK，但正式识别入口同时受登录、次数、网络和账号/VPN状态约束。",
		},
		{
			id: "recognize-lyrics",
			name: "歌词识别",
			locality: "hybrid",
			evidence: [
				pathEvidence({
					label: "smart lyrics web UI",
					path: join(resourcesPath, "image_h5_smart_lyrics/smart-lyrics.html"),
					required: true,
				}),
				pathEvidence({
					label: "lyrics ASR cache",
					path: join(userDataPath, "Cache/AudioFunction/LyricsAsrDetect"),
					required: false,
				}),
				textEvidence({
					label: "lyric recognition quota",
					pattern: "识别歌词（剩余%1次试用）",
					text: localizedText,
				}),
				symbolEvidence({
					label: "lyric recognition draft client",
					library: "libvideoeditor.dylib",
					pattern:
						"TextClient::getLyricsRecognizeInfo|TextClient::addLyricEffect",
					symbols: videoEditorSymbols,
				}),
			],
			conclusion:
				"歌词识别有本地 UI、缓存和草稿 Client，但权益次数和识别结果仍进入服务/账号约束。",
		},
		{
			id: "subtitle-translation",
			name: "字幕翻译/双语字幕",
			locality: "cloud",
			evidence: [
				textEvidence({
					label: "translation server disclosure",
					pattern: "音视频翻译效果.*回传至服务器处理",
					text: localizedText,
				}),
				textEvidence({
					label: "bilingual subtitle entry",
					pattern: "一键生成双语字幕",
					text: localizedText,
				}),
				symbolEvidence({
					label: "translation production path",
					library: "libvideoeditor.dylib",
					pattern: "AudioClient::enableAITranslate|TextClient::translateText",
					symbols: videoEditorSymbols,
				}),
			],
			conclusion:
				"双语字幕/翻译有本地草稿状态，但授权文案明确音视频内容会回传服务器处理。",
		},
		{
			id: "subtitle-template",
			name: "字幕模板/样式/动效",
			locality: "hybrid",
			evidence: [
				pathEvidence({
					label: "subtitle template publisher",
					path: join(
						resourcesPath,
						"image_h5_text_template_publish/publish-subtitle-template.html"
					),
					required: true,
				}),
				pathEvidence({
					label: "AI text template cache",
					path: join(userDataPath, "Cache/AITextTemplate"),
					required: false,
				}),
				textEvidence({
					label: "template quota",
					pattern: "字幕模板能力，导出时扣除",
					text: localizedText,
				}),
				symbolEvidence({
					label: "template rendering and caption animation",
					library: "libvideoeditor.dylib",
					pattern:
						"TextTemplateClient::generateResourcePackage|TextTemplateEditorClient::addCaptionAnim|lvve::CaptionAnim",
					symbols: videoEditorSymbols,
				}),
			],
			conclusion:
				"模板浏览、下载、权益和发布依赖在线服务；已缓存资源的应用、字幕片段编辑和动效渲染属于本地草稿/渲染链。",
		},
		{
			id: "smart-caption-packaging",
			name: "智能包装",
			locality: "cloud",
			evidence: [
				textEvidence({
					label: "draft upload disclosure",
					pattern: "草稿文件回传至服务端进行处理",
					text: localizedText,
				}),
				textEvidence({
					label: "subtitle/highlight packaging description",
					pattern:
						"自动识别全文字幕并高亮其中关键词|智能匹配字幕、花字、音效和特效",
					text: localizedText,
				}),
				textEvidence({
					label: "queue status",
					pattern: "智能包装排队中|智能包装处理中",
					text: localizedText,
				}),
				symbolEvidence({
					label: "draft package state",
					library: "libvideoeditor.dylib",
					pattern: "DraftStore::setIsAiPackagingUsed|setCloudPackageType",
					symbols: videoEditorSymbols,
				}),
			],
			conclusion:
				"智能包装明确上传草稿到服务端，用服务端匹配字幕、花字、音效和特效；本地只负责草稿状态和结果落地。",
		},
	];
	return capabilities.map((capability) => ({
		...capability,
		confidence: confidenceFor({ evidence: capability.evidence }),
	}));
}

function parseArgs({ argv }: { argv: string[] }): CliArgs {
	const args: CliArgs = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--app" && next) {
			args.appPath = next;
			index += 1;
		}
		if (arg === "--user-data" && next) {
			args.userDataPath = next;
			index += 1;
		}
	}
	return args;
}

export function runSubtitleProbe({ options }: { options: ProbeOptions }) {
	return {
		schema: "qcut.jianying-subtitle-probe/1",
		appPath: options.appPath,
		userDataPath: options.userDataPath,
		capabilities: buildProbe(options),
	};
}

if (import.meta.main) {
	const args = parseArgs({ argv: process.argv.slice(2) });
	const report = runSubtitleProbe({
		options: {
			appPath: args.appPath ?? DEFAULT_APP_PATH,
			userDataPath: args.userDataPath ?? DEFAULT_USER_DATA_PATH,
		},
	});
	console.log(JSON.stringify(report, null, 2));
}
