export const JIANYING_TEXT_RUNTIME_INSPECT_CHANNEL =
	"jianying-text-runtime:inspect";
export const JIANYING_TEXT_RUNTIME_RENDER_CHANNEL =
	"jianying-text-runtime:render";
export const JIANYING_TEXT_RUNTIME_CANCEL_CHANNEL =
	"jianying-text-runtime:cancel";

export type JianyingTextRuntimePackageKind =
	| "InfoSticker"
	| "ScriptInfoSticker";

export interface JianyingTextRuntimeReference {
	schemaVersion: 1;
	source: "jianying-cache";
	packageKind: JianyingTextRuntimePackageKind;
	resourceId: string;
	packageHash: string;
	editMode: "runtime-with-preload-fallback";
	slotMapping: "line-to-widget";
	timeMapping: "stretch";
	templateDuration: number;
}

export type JianyingTextRuntimeState =
	| "ready"
	| "unsupported-platform"
	| "bridge-missing"
	| "runtime-missing"
	| "package-missing"
	| "package-invalid"
	| "dependency-missing"
	| "error";

export interface JianyingTextRuntimeStatus {
	state: JianyingTextRuntimeState;
	message: string;
	platform: string;
	bridgeReady: boolean;
	runtimeReady: boolean;
	packageReady: boolean;
	resourceId?: string;
	packageHash?: string;
	templateDuration?: number;
	missingDependencies?: Array<{
		resourceId: string;
		role: "animation" | "sticker";
	}>;
}

export interface JianyingTextRuntimeInspectRequest {
	reference?: JianyingTextRuntimeReference;
}

export interface JianyingTextRuntimeTransform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
}

export interface JianyingTextRuntimeRenderRequest {
	requestId: string;
	reference: JianyingTextRuntimeReference;
	content: string;
	fontAssetId?: string;
	fontSize: number;
	canvasWidth: number;
	canvasHeight: number;
	transform: JianyingTextRuntimeTransform;
	sourceStart: number;
	elementDuration: number;
	frameCount: number;
	fps: number;
	previewVideo?: boolean;
}

export type JianyingTextRuntimeRenderStrategy =
	| "host-text"
	| "runtime-parameters"
	| "preload-copy";

export type JianyingTextRuntimeRenderSource =
	| { kind: "image"; path: string }
	| { kind: "image-sequence"; path: string; frameRate: number };

export interface JianyingTextRuntimeRenderResult {
	requestId: string;
	resourceId: string;
	packageHash: string;
	templateDuration: number;
	frameCount: number;
	strategy: JianyingTextRuntimeRenderStrategy;
	cacheHit: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	previewUrl?: string;
	source: JianyingTextRuntimeRenderSource;
}

export interface JianyingTextRuntimeCancelRequest {
	requestId: string;
}

export interface JianyingTextRuntimeAPI {
	inspect: (
		request?: JianyingTextRuntimeInspectRequest
	) => Promise<JianyingTextRuntimeStatus>;
	render: (
		request: JianyingTextRuntimeRenderRequest
	) => Promise<JianyingTextRuntimeRenderResult>;
	cancel: (request: JianyingTextRuntimeCancelRequest) => Promise<boolean>;
}
