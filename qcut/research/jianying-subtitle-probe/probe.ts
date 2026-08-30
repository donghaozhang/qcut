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

interface SmartPackagingConfigProbe {
	path: string;
	found: boolean;
	values: Record<string, string>;
	draftVideoFlags: number;
}

interface SmartPackagingCacheProbe {
	path: string;
	found: boolean;
	files: Array<{
		name: string;
		sizeBytes: number;
	}>;
}

interface CountByName {
	name: string;
	count: number;
}

interface SmartPackagingAsyncTaskProbe {
	path: string;
	totalTasks: number;
	packagingTasks: Array<{
		enterFrom?: string;
		status?: number;
		errCode?: number;
		duration?: number;
		expectCostTime?: number;
		capKey?: string;
		draftUri?: string;
		materialStorage?: string;
		materialType?: string;
		optionKeys: string[];
		resultDraftUrlHost?: string;
		resultMaterialTypes: CountByName[];
		resultMaterialStorages: CountByName[];
	}>;
}

interface SmartPackagingDraftResultProbe {
	path: string;
	itemCount: number;
	materialTypeCounts: CountByName[];
	report: {
		method?: string;
		pageFrom?: string;
		style?: string;
		textStyle?: string;
		captionIdCount?: number;
	};
}

interface SmartPackagingEndpointProbe {
	routes: string[];
	hosts: string[];
	symbols: string[];
}

interface SmartPackagingProbe {
	config: SmartPackagingConfigProbe;
	cache: SmartPackagingCacheProbe;
	asyncTasks: SmartPackagingAsyncTaskProbe[];
	draftResults: SmartPackagingDraftResultProbe[];
	endpoints: SmartPackagingEndpointProbe;
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

const SMART_PACKAGING_ROUTE_PATTERN =
	/^\/(?:lv\/v[12]\/upload_sign|lv\/v1\/(?:common_task\/(?:new|query|cancel|sync)|copilot\/(?:get_preupload_time|upload_material)|edit\/material\/upload|capflow\/history_task)|agent_edit_api\/(?:common_task\/(?:new|query|cancel)|run_draft_modify_intent)|artist\/v1\/(?:effect\/(?:get_resources_by_category_id|mget_item|mget_artist_item)|panel\/get_panel_info|upload\/data)|artist\/v2\/tools\/get_upload_token)$|^https:\/\/vas\.snssdk\.com\/video\/openapi\/v1\/\?action=(?:GetVideoUploadParams|UpdateVideoUploadInfos)$/u;

const SMART_PACKAGING_HOSTS = new Set([
	"effect.snssdk.com",
	"gecko.zijieapi.com",
	"lv-api.ulikecam.com",
	"lv-effect.ulikecam.com",
	"lv-pc-api.ulikecam.com",
	"mcs.zijieapi.com",
	"vas.snssdk.com",
]);

const SMART_PACKAGING_SYMBOL_PATTERN =
	/^(?:UploaderService_DoUpload|HttpClient_GetTaskId|common_task|ai_packaging_[A-Za-z0-9_]+|template_use_smart_pack|create_ai_package|draft_cloud_package_type|cloud_package_type|cloud_package_completed_time|draft_is_ai_packaging_used)$/u;

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

function readBinaryStrings({ path }: { path: string }): string {
	if (!existsSync(path)) {
		return "";
	}
	const result = spawnSync("strings", [path], {
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	return result.status === 0 ? result.stdout : "";
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

export function parseIniValues({
	text,
}: {
	text: string;
}): Record<string, string> {
	const values: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (
			!line ||
			line.startsWith("[") ||
			line.startsWith(";") ||
			line.startsWith("#")
		) {
			continue;
		}
		const separatorIndex = line.indexOf("=");
		if (separatorIndex < 1) {
			continue;
		}
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		values[key] = value;
	}
	return values;
}

export function sanitizeStorageUri({ value }: { value: string }): string {
	if (/^https?:\/\//u.test(value)) {
		const url = new URL(value);
		return `${url.protocol}//${url.host}/[redacted]`;
	}
	const storageMatch = value.match(/^([A-Za-z0-9-]+)\/.+/u);
	if (storageMatch) {
		return `${storageMatch[1]}/[redacted]`;
	}
	return value;
}

function parseJsonValue({ text }: { text: string }): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function readJsonValue({ path }: { path: string }): unknown {
	if (!existsSync(path)) {
		return undefined;
	}
	return parseJsonValue({ text: readFileSync(path, "utf8") });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function countByName({ values }: { values: string[] }): CountByName[] {
	const counts = new Map<string, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, count]) => ({ name, count }));
}

export function collectMaterialCounts({
	materials,
	key,
}: {
	materials: unknown;
	key: string;
}): CountByName[] {
	const values: string[] = [];
	for (const item of asArray(materials)) {
		if (!isRecord(item)) {
			continue;
		}
		const value = asString(item[key]);
		if (value) {
			values.push(value);
		}
	}
	return countByName({ values });
}

function findFilesByName({
	rootPath,
	fileName,
	maxDepth,
}: {
	rootPath: string;
	fileName: string;
	maxDepth: number;
}): string[] {
	if (!existsSync(rootPath) || maxDepth < 0) {
		return [];
	}
	const matches: string[] = [];
	for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
		const childPath = join(rootPath, entry.name);
		if (entry.isFile() && entry.name === fileName) {
			matches.push(childPath);
			continue;
		}
		if (entry.isDirectory()) {
			matches.push(
				...findFilesByName({
					rootPath: childPath,
					fileName,
					maxDepth: maxDepth - 1,
				})
			);
		}
	}
	return matches;
}

function summarizeConfig({
	userDataPath,
}: {
	userDataPath: string;
}): SmartPackagingConfigProbe {
	const configPath = join(userDataPath, "Config/ai_packaging.ini");
	const rawValues = parseIniValues({
		text: readOptionalTextFile({ path: configPath }),
	});
	const draftFlagKeys = Object.keys(rawValues).filter((key) =>
		key.endsWith("_video")
	);
	const values: Record<string, string> = {};
	let redactedIndex = 0;
	for (const [key, value] of Object.entries(rawValues)) {
		if (key.endsWith("_video")) {
			redactedIndex += 1;
			values[`[draft-id-${redactedIndex}]_video`] = value;
			continue;
		}
		values[key] = value;
	}
	return {
		path: configPath,
		found: existsSync(configPath),
		values,
		draftVideoFlags: draftFlagKeys.length,
	};
}

function summarizeCache({
	userDataPath,
}: {
	userDataPath: string;
}): SmartPackagingCacheProbe {
	const cachePath = join(userDataPath, "Cache/SmartPackCache");
	if (!existsSync(cachePath)) {
		return {
			path: cachePath,
			found: false,
			files: [],
		};
	}
	const files = readdirSync(cachePath, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => {
			const filePath = join(cachePath, entry.name);
			return {
				name: entry.name,
				sizeBytes: statSync(filePath).size,
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
	return {
		path: cachePath,
		found: true,
		files,
	};
}

function parseEmbeddedJson({ value }: { value: unknown }): unknown {
	const text = asString(value);
	if (!text) {
		return undefined;
	}
	return parseJsonValue({ text });
}

function hostFromUrl({ value }: { value: string }): string | undefined {
	try {
		return new URL(value).host;
	} catch {
		return undefined;
	}
}

function summarizePackagingTask({
	task,
}: {
	task: Record<string, unknown>;
}): SmartPackagingAsyncTaskProbe["packagingTasks"][number] | undefined {
	const requestPayload = parseEmbeddedJson({ value: task.request_payload });
	if (!isRecord(requestPayload)) {
		return undefined;
	}
	if (requestPayload.cap_key !== "ai_packaging_draft") {
		return undefined;
	}
	const capJson = isRecord(requestPayload.cap_json)
		? requestPayload.cap_json
		: {};
	const draft = isRecord(capJson.draft) ? capJson.draft : {};
	const material = isRecord(capJson.material) ? capJson.material : {};
	const options = isRecord(capJson.options) ? capJson.options : {};
	const resultPayload = parseEmbeddedJson({ value: task.result_payload });
	const responseJsonText = isRecord(resultPayload)
		? asString(resultPayload.resp_json)
		: undefined;
	const responseJson = responseJsonText
		? parseJsonValue({ text: responseJsonText })
		: undefined;
	const response = isRecord(responseJson) ? responseJson : {};
	const responseDraft = isRecord(response.draft) ? response.draft : {};
	const analytics = isRecord(response.analytics) ? response.analytics : {};
	const materials = analytics.materials;
	const draftUrl = asString(responseDraft.url);
	const draftUri = asString(draft.uri);
	return {
		enterFrom: asString(task.enter_from),
		status: asNumber(task.status),
		errCode: asNumber(task.err_code),
		duration: asNumber(task.duration),
		expectCostTime: asNumber(task.expect_cost_time),
		capKey: asString(requestPayload.cap_key),
		draftUri: draftUri ? sanitizeStorageUri({ value: draftUri }) : undefined,
		materialStorage: asString(material.storage),
		materialType: asString(material.type),
		optionKeys: Object.keys(options).sort(),
		resultDraftUrlHost: draftUrl ? hostFromUrl({ value: draftUrl }) : undefined,
		resultMaterialTypes: collectMaterialCounts({ materials, key: "type" }),
		resultMaterialStorages: collectMaterialCounts({
			materials,
			key: "storage",
		}),
	};
}

function summarizeAsyncTasks({
	userDataPath,
}: {
	userDataPath: string;
}): SmartPackagingAsyncTaskProbe[] {
	const projectsPath = join(userDataPath, "Projects/com.lveditor.draft");
	const taskFiles = findFilesByName({
		rootPath: projectsPath,
		fileName: "attachment_async_tasks.json",
		maxDepth: 4,
	});
	const summaries: SmartPackagingAsyncTaskProbe[] = [];
	for (const path of taskFiles) {
		const value = readJsonValue({ path });
		if (!isRecord(value)) {
			continue;
		}
		const tasks = asArray(value.tasks);
		const packagingTasks = tasks
			.filter(isRecord)
			.map((task) => summarizePackagingTask({ task }))
			.filter(
				(
					task
				): task is SmartPackagingAsyncTaskProbe["packagingTasks"][number] =>
					Boolean(task)
			);
		if (packagingTasks.length === 0) {
			continue;
		}
		summaries.push({
			path,
			totalTasks: tasks.length,
			packagingTasks,
		});
	}
	return summaries.sort((left, right) => left.path.localeCompare(right.path));
}

function summarizeDraftResult({
	path,
}: {
	path: string;
}): SmartPackagingDraftResultProbe | undefined {
	const value = readJsonValue({ path });
	if (!isRecord(value)) {
		return undefined;
	}
	const items = asArray(value.ai_packaging_infos).filter(isRecord);
	if (items.length === 0) {
		return undefined;
	}
	const materialTypes = items
		.map((item) => item.material_type)
		.filter(
			(materialType): materialType is string | number =>
				typeof materialType === "string" || typeof materialType === "number"
		)
		.map((materialType) => String(materialType));
	const report = isRecord(value.ai_packaging_report_info)
		? value.ai_packaging_report_info
		: {};
	return {
		path,
		itemCount: items.length,
		materialTypeCounts: countByName({ values: materialTypes }),
		report: {
			method: asString(report.method),
			pageFrom: asString(report.page_from),
			style: asString(report.style),
			textStyle: asString(report.text_style),
			captionIdCount: asArray(report.caption_id_list).length || undefined,
		},
	};
}

function summarizeDraftResults({
	userDataPath,
}: {
	userDataPath: string;
}): SmartPackagingDraftResultProbe[] {
	const projectsPath = join(userDataPath, "Projects/com.lveditor.draft");
	return findFilesByName({
		rootPath: projectsPath,
		fileName: "attachment_pc_common.json",
		maxDepth: 3,
	})
		.map((path) => summarizeDraftResult({ path }))
		.filter((result): result is SmartPackagingDraftResultProbe =>
			Boolean(result)
		)
		.sort((left, right) => left.path.localeCompare(right.path));
}

function extractMatchingLines({
	text,
	pattern,
}: {
	text: string;
	pattern: RegExp;
}): string[] {
	const matches = new Set<string>();
	for (const line of text.split(/\r?\n/u)) {
		const trimmed = line.trim();
		if (pattern.test(trimmed)) {
			matches.add(trimmed);
		}
	}
	return [...matches].sort();
}

function extractKnownHosts({ text }: { text: string }): string[] {
	const matches = new Set<string>();
	const urlPattern = /https?:\/\/[^\s"'<>]+/gu;
	for (const match of text.matchAll(urlPattern)) {
		const value = match[0];
		try {
			const host = new URL(value).host;
			if (SMART_PACKAGING_HOSTS.has(host)) {
				matches.add(`https://${host}`);
			}
		} catch {}
	}
	return [...matches].sort();
}

function summarizeEndpoints({
	appPath,
}: {
	appPath: string;
}): SmartPackagingEndpointProbe {
	const frameworksPath = join(appPath, "Contents/Frameworks");
	const libraries = [
		"libVEConfig.dylib",
		"libvideoeditor.dylib",
		"libAICreator.dylib",
		"libDeepAgentsService.dylib",
	];
	const stringsText = libraries
		.map((library) =>
			readBinaryStrings({ path: join(frameworksPath, library) })
		)
		.join("\n");
	return {
		routes: extractMatchingLines({
			text: stringsText,
			pattern: SMART_PACKAGING_ROUTE_PATTERN,
		}),
		hosts: extractKnownHosts({ text: stringsText }),
		symbols: extractMatchingLines({
			text: stringsText,
			pattern: SMART_PACKAGING_SYMBOL_PATTERN,
		}),
	};
}

function buildSmartPackagingProbe({
	appPath,
	userDataPath,
}: ProbeOptions): SmartPackagingProbe {
	return {
		config: summarizeConfig({ userDataPath }),
		cache: summarizeCache({ userDataPath }),
		asyncTasks: summarizeAsyncTasks({ userDataPath }),
		draftResults: summarizeDraftResults({ userDataPath }),
		endpoints: summarizeEndpoints({ appPath }),
	};
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
		schema: "qcut.jianying-subtitle-probe/2",
		appPath: options.appPath,
		userDataPath: options.userDataPath,
		capabilities: buildProbe(options),
		smartPackaging: buildSmartPackagingProbe(options),
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
