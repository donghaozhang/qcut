export interface CapabilityArtifact {
	root: "frameworks" | "models";
	relativePath: string;
	required: boolean;
}

export interface CapabilitySymbolGroup {
	library: string;
	demangledNames: string[];
}

export interface LocalVideoCapability {
	id:
		| "deflicker"
		| "stabilization"
		| "bytenn-denoise"
		| "umvfi-interpolation"
		| "optical-flow-motion-blur"
		| "smart-motion"
		| "smart-crop"
		| "camera-tracking"
		| "eye-correction"
		| "ai-super-resolution";
	localizedName: string;
	locality: "confirmed-local" | "local-provider-unresolved";
	probeMode:
		| "lens-factory"
		| "bytenn-model"
		| "saliency-sequence"
		| "saliency-frame"
		| "object-tracking-model"
		| "effect-runtime"
		| "discovery-only";
	artifacts: CapabilityArtifact[];
	symbolGroups: CapabilitySymbolGroup[];
	boundary: string;
}

export const LOCAL_VIDEO_CAPABILITIES: LocalVideoCapability[] = [
	{
		id: "deflicker",
		localizedName: "防闪烁",
		locality: "confirmed-local",
		probeMode: "lens-factory",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "liblens.dylib",
				required: true,
			},
			{
				root: "models",
				relativePath: "deflicker/deflicker.bundle/deflicker.metallib",
				required: true,
			},
		],
		symbolGroups: [
			{
				library: "liblens.dylib",
				demangledNames: [
					"ies::deflicker::DeflickerFactory::createDeflickerInstance()",
					"ies::deflicker::DeflickerFactory::deleteDeflickerInstance",
				],
			},
			{
				library: "libvideoeditor.dylib",
				demangledNames: ["DeflickerClient::startConvertDeflicker"],
			},
		],
		boundary:
			"构造 Lens Deflicker 对象并装载 Metal 库；尚不等于整段视频转换完成。",
	},
	{
		id: "stabilization",
		localizedName: "剪映防抖",
		locality: "confirmed-local",
		probeMode: "lens-factory",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "liblens.dylib",
				required: true,
			},
		],
		symbolGroups: [
			{
				library: "liblens.dylib",
				demangledNames: [
					"ies::vas::VASFactory::createVASInstance()",
					"ies::vas::VASFactory::deleteVASInstance",
				],
			},
			{
				library: "libvideoeditor.dylib",
				demangledNames: ["VideoStableClient::startVideoStabProcess"],
			},
		],
		boundary: "构造本地 VAS 对象；矩阵分析和真实视频安全裁切仍需输入级探针。",
	},
	{
		id: "bytenn-denoise",
		localizedName: "ByteNN 降噪",
		locality: "confirmed-local",
		probeMode: "bytenn-model",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "libbytenn.dylib",
				required: true,
			},
			{
				root: "models",
				relativePath: "noise_reduction/nn_denoise.bytenn",
				required: true,
			},
		],
		symbolGroups: [
			{
				library: "libbytenn.dylib",
				demangledNames: ["IESNN::Interpreter::CreateFromFile(char const*)"],
			},
			{
				library: "liblens.dylib",
				demangledNames: ["vd::nn::NNDenoiseFilterMetal::exec"],
			},
			{
				library: "libvideoeditor.dylib",
				demangledNames: ["NoiseReductionClient::startConvertNoiseReduction"],
			},
		],
		boundary: "直接让 ByteNN 解释器解析降噪模型；像素推理另行报告。",
	},
	{
		id: "umvfi-interpolation",
		localizedName: "UMVFI 补帧",
		locality: "confirmed-local",
		probeMode: "lens-factory",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "liblens.dylib",
				required: true,
			},
			{
				root: "models",
				relativePath: "umvfi/umvfi.bundle/umvfi.metallib",
				required: true,
			},
			{
				root: "models",
				relativePath: "interpolation/lens_vfi_v1.0.model",
				required: true,
			},
		],
		symbolGroups: [
			{
				library: "liblens.dylib",
				demangledNames: [
					"ies::umvfi::UMVFIFactory::createUMVFIInstance()",
					"ies::umvfi::UMVFIFactory::deleteUMVFIInstance",
				],
			},
			{
				library: "libvideoeditor.dylib",
				demangledNames: ["InterpolationClient::startConvertSlowMotion"],
			},
		],
		boundary:
			"构造 UMVFI 对象并装载 Metal 库；两帧到中间帧的像素调用仍单独验收。",
	},
	{
		id: "optical-flow-motion-blur",
		localizedName: "光流运动模糊",
		locality: "confirmed-local",
		probeMode: "lens-factory",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "liblens.dylib",
				required: true,
			},
		],
		symbolGroups: [
			{
				library: "liblens.dylib",
				demangledNames: [
					"ies::vmb::VMBFactory::createVMBInstance()",
					"ies::vmb::VMBFactory::deleteVMBInstance",
					"ies::vmb::VideoVMB::process_optical_flow_process()",
				],
			},
			{
				library: "libvideoeditor.dylib",
				demangledNames: ["MotionBlurClient::startConvertMotionBlur"],
			},
		],
		boundary: "构造 VMB 光流对象；时域多帧输出尚需输入级探针。",
	},
	{
		id: "smart-motion",
		localizedName: "智能运镜",
		locality: "confirmed-local",
		probeMode: "saliency-sequence",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "libcccreator.dylib",
				required: true,
			},
			{
				root: "models",
				relativePath: "saliency_seg_model/bingo_saliency_seg_v1.0.model",
				required: true,
			},
		],
		symbolGroups: [
			{
				library: "libvideoeditor.dylib",
				demangledNames: [
					"VideoClient::addVideoSmartMotion",
					"VideoClient::addSingleSmartMotionKeyframes",
				],
			},
		],
		boundary:
			"运行显著性序列并生成 QCut-owned 可检查轨迹；不宣称复刻剪映的运镜策略。",
	},
	{
		id: "smart-crop",
		localizedName: "智能裁剪",
		locality: "confirmed-local",
		probeMode: "saliency-frame",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "libcccreator.dylib",
				required: true,
			},
			{
				root: "models",
				relativePath: "saliency_seg_model/bingo_saliency_seg_v1.0.model",
				required: true,
			},
			{
				root: "models",
				relativePath: "nh_script/saliencyseg_crop_script.model",
				required: false,
			},
		],
		symbolGroups: [
			{
				library: "libcccreator.dylib",
				demangledNames: [
					"Bingo_SaliencySeg_createHandle",
					"Bingo_SaliencySeg_process",
				],
			},
			{
				library: "libvideoeditor.dylib",
				demangledNames: ["SmartCropClient::runSmartCropAlgorithm"],
			},
		],
		boundary: "输出真实显著性 Mask 和可检查裁剪框；不冒充剪映最终平滑策略。",
	},
	{
		id: "camera-tracking",
		localizedName: "镜头追踪",
		locality: "confirmed-local",
		probeMode: "object-tracking-model",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "libcccreator.dylib",
				required: true,
			},
			{
				root: "models",
				relativePath: "object_tracking/bingo_objectTracking_v1.0.dat",
				required: true,
			},
			{
				root: "models",
				relativePath: "single_object_tracking_v1.0.model",
				required: false,
			},
		],
		symbolGroups: [
			{
				library: "libcccreator.dylib",
				demangledNames: [
					"Bingo_ObjectTracking_createHandle",
					"Bingo_ObjectTracking_init",
					"Bingo_ObjectTracking_trackFrame",
				],
			},
			{
				library: "libvideoeditor.dylib",
				demangledNames: ["StickerClient::startVideoTrackingV3"],
			},
		],
		boundary: "初始化本地跟踪模型；逐帧目标框和镜头关键帧是下一验证层。",
	},
	{
		id: "eye-correction",
		localizedName: "眼神修正",
		locality: "confirmed-local",
		probeMode: "effect-runtime",
		artifacts: [
			{
				root: "frameworks",
				relativePath: "libcccreator.dylib",
				required: true,
			},
			{
				root: "models",
				relativePath: "idream/tt_eyegrad_v1.0.model",
				required: true,
			},
			{
				root: "models",
				relativePath: "tt_eyefitting/tt_eyefitting_v1.0.model",
				required: true,
			},
		],
		symbolGroups: [],
		boundary:
			"初始化包含眼部模型的 Bach/Amazing 运行时；眼神矫正像素结果尚未宣称跑通。",
	},
	{
		id: "ai-super-resolution",
		localizedName: "AI 超分",
		locality: "local-provider-unresolved",
		probeMode: "discovery-only",
		artifacts: [],
		symbolGroups: [
			{
				library: "libvideoeditor.dylib",
				demangledNames: [
					"SuperResolutionClient::startConvertSuperResolution",
					"SuperResolutionClient::getSuperResolutionPath",
				],
			},
		],
		boundary:
			"只有任务 Client，当前安装包没有定位到随包本地超分模型；探针用于阻止误报本地。",
	},
];
