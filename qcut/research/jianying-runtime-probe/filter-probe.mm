#include "filter-probe.h"

#include "amazer-context-scope.h"
#include "filter-face-inspect.h"
#include "filter-host-support.h"
#include "filter-sequence-io.h"
#include "graphics-probe.h"
#include "probe-utils.h"

#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <iostream>
#include <limits>
#include <memory>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace jianying_probe {
namespace {

constexpr int kVideoSegmentType = 7;
constexpr int kAutomaticRendererType = 14;
constexpr std::int64_t kTimelineDuration = 86'400'000'000;
constexpr std::string_view kLegacyFilterCoreUuid =
    "9A8A8F6B-31C0-3DDC-85AC-5F11087D7965";
constexpr std::string_view kPrivateFilterCoreUuid =
    "D6342ECD-5432-33F0-A2AD-0C28F5699994";
constexpr std::size_t kVerifiedSwingManagerSize = 0x370;

struct FilterRuntimeProfile {
  std::string_view uuid;
  std::uintptr_t contextConstructorOffset;
  std::uintptr_t contextDestructorOffset;
};

[[nodiscard]] FilterRuntimeProfile filterRuntimeProfile(
    const void* imageSymbol) {
  const std::string uuid = runtimeImageUuid(imageSymbol);
  if (uuid == kLegacyFilterCoreUuid) {
    return {
        .uuid = kLegacyFilterCoreUuid,
        .contextConstructorOffset = 0x3fb3cc,
        .contextDestructorOffset = 0x3fb3f8,
    };
  }
  if (uuid == kPrivateFilterCoreUuid) {
    return {
        .uuid = kPrivateFilterCoreUuid,
        .contextConstructorOffset = 0x3fb3bc,
        .contextDestructorOffset = 0x3fb3e8,
    };
  }
  throw std::runtime_error("unsupported libcccreator UUID " + uuid);
}

constexpr std::string_view kCreateSwingManager =
    "bef_swing_manager_create_with_gpdevice";
constexpr std::string_view kDestroySwingManager = "bef_swing_manager_destroy";
constexpr std::string_view kGetSwingManagerAmazer =
    "_ZNK13AmazingEngine12SwingManager9getAmazerEv";
constexpr std::string_view kSetManagerParameterBool =
    "bef_swing_manager_set_parameter_bool";
constexpr std::string_view kSetManagerParameterInt =
    "bef_swing_manager_set_parameter_int";
constexpr std::string_view kSetManagerUpdateMode =
    "bef_swing_manager_set_update_mode";
constexpr std::string_view kAddManagerSegment =
    "bef_swing_manager_add_segment";
constexpr std::string_view kSeekManagerDeviceTextureWithData =
    "bef_swing_manager_seek_frame_device_texture_with_data";
constexpr std::string_view kCreateSegment = "bef_swing_segment_create";
constexpr std::string_view kDestroySegment = "bef_swing_segment_destroy";
constexpr std::string_view kResetSegment = "bef_swing_segment_reset";
constexpr std::string_view kSetSegmentParams =
    "bef_swing_segment_set_params";
constexpr std::string_view kSetSegmentTimeRange =
    "bef_swing_segment_set_time_range";
constexpr std::string_view kSetSegmentRenderIndex =
    "bef_swing_segment_set_render_index";
constexpr std::string_view kCreateVideoFeature =
    "bef_swing_segment_video_create_feature";
constexpr std::string_view kAddVideoFeature =
    "bef_swing_segment_video_add_feature";
constexpr std::string_view kSetVideoDeviceTexture =
    "bef_swing_segment_video_set_device_texture";
constexpr std::string_view kGetVideoAlgorithmSize =
    "bef_swing_segment_video_get_algorithm_width_height";
constexpr std::string_view kConvertMetalTextureInPlace =
    "_ZN13AmazingEngine12SwingTexture26convertMetalTextureInPlaceER13DeviceText"
    "urePNS_12SwingManagerERKNS_12RendererTypeEx";
constexpr std::string_view kConfigureAbValue = "bef_effect_config_ab_value";
constexpr std::string_view kConstructSwingManager =
    "_ZN13AmazingEngine12SwingManagerC2Ev";
constexpr std::string_view kInitializeSwingManager =
    "_ZN13AmazingEngine12SwingManager4initERKNS_8Vector2iEiPFPcPvPKcS7_"
    "EyPNS_8GPDeviceE";
constexpr std::string_view kConstructBefContextScope =
    "_ZN3BEF16BEFContextSetterC2EPNS_10BEFContextE";
constexpr std::string_view kDestroyBefContextScope =
    "_ZN3BEF16BEFContextSetterD2Ev";
constexpr std::string_view kIsParallelAsyncSwingEnabled =
    "_ZNK13AmazingEngine12SwingManager30isParallelAndAsyncSwingEnabledEv";

using ResourceFinderMethod = char* (*)(void*, const char*, const char*);
using GetObjectMethod = void* (*)(const void*);
using CreateSwingManagerMethod = int (*)(void**, unsigned int, unsigned int,
                                         ResourceFinderMethod, bool, void*);
using HandleMethod = int (*)(void*);
using SetBoolMethod = int (*)(void*, const char*, bool);
using SetNamedIntMethod = int (*)(void*, const char*, int);
using SetSegmentParamsMethod = int (*)(void*, const char*);
using SetIntMethod = int (*)(void*, int);
using CreateSegmentMethod = int (*)(void*, void**, int, const char*);
using CreateFeatureMethod = int (*)(void*, void**, const char*);
using AddChildMethod = int (*)(void*, void*);
using SetTimeRangeMethod = int (*)(void*, std::int64_t, std::int64_t);
using SetVideoTextureMethod = int (*)(void*, const DeviceTextureProbe*);
struct SwingDeviceTextureDataProbe {
  int code = 0;
  int padding = 0;
  const DeviceTextureProbe* texture = nullptr;
};

static_assert(sizeof(SwingDeviceTextureDataProbe) == 0x10);

using SeekDeviceTextureWithDataMethod = int (*)(
    void*, std::int64_t, const SwingDeviceTextureDataProbe*,
    const SwingDeviceTextureDataProbe*);
using GetAlgorithmSizeMethod = int (*)(void*, int*, int*);
using ConvertTextureMethod = void (*)(DeviceTextureProbe*, void*, const int*,
                                      std::int64_t);
using ConfigureAbValueMethod = int (*)(const char*, const void*, int);
using ObjectMethod = void (*)(void*);
using ContextConstructorMethod = void (*)(void*, void*);
using InitializeSwingManagerMethod = void (*)(
    void*, const int*, int, ResourceFinderMethod, std::uint64_t, void*);
using BoolObjectMethod = bool (*)(const void*);

struct FilterSymbols {
  CreateSwingManagerMethod createManager;
  HandleMethod destroyManager;
  GetObjectMethod getManagerAmazer;
  SetBoolMethod setManagerParameterBool;
  SetNamedIntMethod setManagerParameterInt;
  SetIntMethod setManagerUpdateMode;
  AddChildMethod addManagerSegment;
  SeekDeviceTextureWithDataMethod seekManagerDeviceTextureWithData;
  CreateSegmentMethod createSegment;
  HandleMethod destroySegment;
  HandleMethod resetSegment;
  SetSegmentParamsMethod setSegmentParams;
  SetTimeRangeMethod setSegmentTimeRange;
  SetIntMethod setSegmentRenderIndex;
  CreateFeatureMethod createVideoFeature;
  AddChildMethod addVideoFeature;
  SetVideoTextureMethod setVideoDeviceTexture;
  GetAlgorithmSizeMethod getVideoAlgorithmSize;
  ConvertTextureMethod convertMetalTextureInPlace;
  ConfigureAbValueMethod configureAbValue;
  ObjectMethod constructManager;
  InitializeSwingManagerMethod initializeManager;
  ContextConstructorMethod constructBefContextScope;
  ObjectMethod destroyBefContextScope;
  BoolObjectMethod isParallelAsyncSwingEnabled;
};

[[nodiscard]] FilterSymbols loadFilterSymbols(const fs::path& runtimeRoot) {
  void* core = openLibrary(runtimeRoot / "Frameworks" / "libcccreator.dylib");
  return {
      .createManager =
          resolveSymbol<CreateSwingManagerMethod>(core, kCreateSwingManager),
      .destroyManager = resolveSymbol<HandleMethod>(core, kDestroySwingManager),
      .getManagerAmazer =
          resolveSymbol<GetObjectMethod>(core, kGetSwingManagerAmazer),
      .setManagerParameterBool =
          resolveSymbol<SetBoolMethod>(core, kSetManagerParameterBool),
      .setManagerParameterInt =
          resolveSymbol<SetNamedIntMethod>(core, kSetManagerParameterInt),
      .setManagerUpdateMode =
          resolveSymbol<SetIntMethod>(core, kSetManagerUpdateMode),
      .addManagerSegment = resolveSymbol<AddChildMethod>(core, kAddManagerSegment),
      .seekManagerDeviceTextureWithData =
          resolveSymbol<SeekDeviceTextureWithDataMethod>(
              core, kSeekManagerDeviceTextureWithData),
      .createSegment = resolveSymbol<CreateSegmentMethod>(core, kCreateSegment),
      .destroySegment = resolveSymbol<HandleMethod>(core, kDestroySegment),
      .resetSegment = resolveSymbol<HandleMethod>(core, kResetSegment),
      .setSegmentParams =
          resolveSymbol<SetSegmentParamsMethod>(core, kSetSegmentParams),
      .setSegmentTimeRange =
          resolveSymbol<SetTimeRangeMethod>(core, kSetSegmentTimeRange),
      .setSegmentRenderIndex =
          resolveSymbol<SetIntMethod>(core, kSetSegmentRenderIndex),
      .createVideoFeature =
          resolveSymbol<CreateFeatureMethod>(core, kCreateVideoFeature),
      .addVideoFeature = resolveSymbol<AddChildMethod>(core, kAddVideoFeature),
      .setVideoDeviceTexture =
          resolveSymbol<SetVideoTextureMethod>(core, kSetVideoDeviceTexture),
      .getVideoAlgorithmSize =
          resolveSymbol<GetAlgorithmSizeMethod>(core, kGetVideoAlgorithmSize),
      .convertMetalTextureInPlace =
          resolveSymbol<ConvertTextureMethod>(core, kConvertMetalTextureInPlace),
      .configureAbValue =
          resolveSymbol<ConfigureAbValueMethod>(core, kConfigureAbValue),
      .constructManager =
          resolveSymbol<ObjectMethod>(core, kConstructSwingManager),
      .initializeManager = resolveSymbol<InitializeSwingManagerMethod>(
          core, kInitializeSwingManager),
      .constructBefContextScope = resolveSymbol<ContextConstructorMethod>(
          core, kConstructBefContextScope),
      .destroyBefContextScope =
          resolveSymbol<ObjectMethod>(core, kDestroyBefContextScope),
      .isParallelAsyncSwingEnabled = resolveSymbol<BoolObjectMethod>(
          core, kIsParallelAsyncSwingEnabled),
  };
}

[[nodiscard]] int createParallelAsyncManager(
    const FilterSymbols& symbols, void** manager, int width, int height,
    ResourceFinderMethod resourceFinder, bool algorithmAsync,
    void* graphicsDevice) {
  verifyRuntimeImage(reinterpret_cast<const void*>(symbols.constructManager),
                     kLegacyFilterCoreUuid);
  void* instance = ::operator new(kVerifiedSwingManagerSize);
  symbols.constructManager(instance);

  void* befContext = nullptr;
  std::memcpy(&befContext, static_cast<std::byte*>(instance) + 8,
              sizeof(befContext));
  if (befContext == nullptr) {
    symbols.destroyManager(instance);
    throw std::runtime_error("SwingManager has no BEF context after construction");
  }

  alignas(8) std::array<std::byte, 8> contextScope{};
  symbols.constructBefContextScope(contextScope.data(), befContext);
  const std::array<int, 2> dimensions = {width, height};
  const int algorithmMode = algorithmAsync ? 2 : 0;
  symbols.initializeManager(instance, dimensions.data(), algorithmMode,
                            resourceFinder, 8, graphicsDevice);
  symbols.destroyBefContextScope(contextScope.data());

  if (!symbols.isParallelAsyncSwingEnabled(instance)) {
    symbols.destroyManager(instance);
    throw std::runtime_error("parallel/async Swing was disabled during init");
  }
  *manager = instance;
  return 0;
}

[[nodiscard]] DeviceTextureProbe bridgeTexture(
    const FilterSymbols& symbols, void* manager,
    const DeviceTextureProbe& texture, std::int64_t timestamp) {
  DeviceTextureProbe bridged = texture;
  symbols.convertMetalTextureInPlace(&bridged, manager, &kAutomaticRendererType,
                                     timestamp);
  return bridged;
}

class FilterHostSession {
 public:
  FilterHostSession(const FilterSymbols& symbols, const ModelCatalog& models,
                    OpenGlContext& openGlContext, const fs::path& packagePath,
                    const GraphicsFrameResources& resources,
                    int inputTextureDataCode, int outputTextureDataCode,
                    int algorithmCacheFlag, std::string featureParameters,
                    bool exportMode, bool enableSwingSimplify,
                    bool enableAdjustColorWithFloat,
                    bool enableImageQuality, bool managerCreateOption,
                    bool enableParallelAsyncSwing, bool useBefContextScope)
      : symbols_(symbols), registration_(models),
        openGlContext_(openGlContext),
        packagePath_(packagePath),
        width_(resources.width), height_(resources.height),
        graphicsDevice_(resources.graphicsDevice),
        inputTextureDataCode_(inputTextureDataCode),
        outputTextureDataCode_(outputTextureDataCode),
        algorithmCacheFlag_(algorithmCacheFlag),
        featureParameters_(std::move(featureParameters)),
        exportMode_(exportMode),
        enableSwingSimplify_(enableSwingSimplify),
        enableAdjustColorWithFloat_(enableAdjustColorWithFloat),
        enableImageQuality_(enableImageQuality),
        managerCreateOption_(managerCreateOption),
        enableParallelAsyncSwing_(enableParallelAsyncSwing),
        useBefContextScope_(useBefContextScope) {
    // registration_ owns catalog activation: if createHost() throws, this
    // destructor never runs, but the member's does.
    createHost();
    if (ready_ &&
        featureParameters_.find("\"draft_path\"") != std::string::npos) {
      const int result =
          symbols_.setSegmentParams(feature_, featureParameters_.c_str());
      featureParametersApplied_ = result == 0;
      std::cout << "[filter] pre-frame manual cache params result = "
                << result << '\n';
    }
  }

  ~FilterHostSession() {
    destroyHost();
  }

  FilterHostSession(const FilterHostSession&) = delete;
  FilterHostSession& operator=(const FilterHostSession&) = delete;

  void setFeatureParameters(std::string featureParameters) {
    if (featureParameters_ == featureParameters) {
      return;
    }
    featureParameters_ = std::move(featureParameters);
    featureParametersApplied_ = false;
  }

  [[nodiscard]] bool setFeatureParametersNow(
      std::string_view featureParameters) {
    if (!ready_) {
      return false;
    }
    openGlContext_.makeCurrent();
    featureParameters_ = featureParameters;
    const int parameterResult = symbols_.setSegmentParams(
        feature_, featureParameters_.c_str());
    featureParametersApplied_ = parameterResult == 0;
    if (parameterResult != 0) {
      std::cout << "[filter] immediate feature params result = "
                << parameterResult << '\n';
    }
    return parameterResult == 0;
  }

  [[nodiscard]] bool render(const GraphicsFrameResources& resources,
                            std::span<const UpdateModePass> renderPasses,
                            std::string_view resetAction,
                            std::int64_t timestamp,
                            int stageDelayMilliseconds) {
    if (resetAction == "manager") {
      destroyHost();
      createHost();
    } else if (resetAction == "feature") {
      std::cout << "[filter] feature reset result = "
                << symbols_.resetSegment(feature_) << '\n';
    } else if (resetAction == "video") {
      std::cout << "[filter] video reset result = "
                << symbols_.resetSegment(video_) << '\n';
    }
    if (!ready_ || resources.graphicsDevice != graphicsDevice_) {
      return false;
    }

    const DeviceTextureProbe input =
        bridgeTexture(symbols_, manager_, resources.inputA, timestamp);
    const DeviceTextureProbe output =
        bridgeTexture(symbols_, manager_, resources.output, timestamp);
    int modeResult = 0;
    int textureResult = 0;
    int seekResult = 0;
    const SwingDeviceTextureDataProbe inputData = {
        .code = inputTextureDataCode_,
        .texture = &input,
    };
    const SwingDeviceTextureDataProbe outputData = {
        .code = outputTextureDataCode_,
        .texture = &output,
    };
    for (std::size_t passIndex = 0; passIndex < renderPasses.size();
         passIndex += 1) {
      const UpdateModePass& renderPass = renderPasses[passIndex];
      for (const int updateMode : renderPass.modes) {
        const int currentModeResult =
            symbols_.setManagerUpdateMode(manager_, updateMode);
        if (currentModeResult != 0) {
          modeResult = currentModeResult;
        }
      }
      const int currentTextureResult =
          symbols_.setVideoDeviceTexture(video_, &input);
      const int currentSeekResult = symbols_.seekManagerDeviceTextureWithData(
          manager_, timestamp, &inputData, &outputData);
      if (currentTextureResult != 0) {
        textureResult = currentTextureResult;
      }
      if (currentSeekResult != 0) {
        seekResult = currentSeekResult;
      }
      if (stageDelayMilliseconds > 0 && passIndex + 1 < renderPasses.size()) {
        std::this_thread::sleep_for(
            std::chrono::milliseconds(stageDelayMilliseconds));
      }
    }
    std::cout << "[filter] timestamp=" << timestamp << " passes=";
    for (std::size_t passIndex = 0; passIndex < renderPasses.size();
         passIndex += 1) {
      const UpdateModePass& renderPass = renderPasses[passIndex];
      std::cout << (passIndex == 0 ? "" : ";");
      if (renderPass.modes.empty()) {
        std::cout << "keep";
        continue;
      }
      for (std::size_t modeIndex = 0; modeIndex < renderPass.modes.size();
           modeIndex += 1) {
        std::cout << (modeIndex == 0 ? "" : ",")
                  << renderPass.modes[modeIndex];
      }
    }
    std::cout << " reset=" << resetAction << " results=" << modeResult << ','
              << textureResult << ',' << seekResult << " texture_data="
              << inputTextureDataCode_ << ',' << outputTextureDataCode_;
    printAlgorithmSize("after-render");
    int parameterResult = 0;
    if (seekResult == 0 && !featureParameters_.empty() &&
        !featureParametersApplied_) {
      parameterResult =
          symbols_.setSegmentParams(feature_, featureParameters_.c_str());
      featureParametersApplied_ = parameterResult == 0;
      std::cout << "[filter] post-frame feature params result = "
                << parameterResult << '\n';
    }
    return modeResult == 0 && textureResult == 0 && seekResult == 0 &&
           parameterResult == 0;
  }

 private:
  void printAlgorithmSize(std::string_view stage) const {
    int algorithmWidth = 0;
    int algorithmHeight = 0;
    const int result = video_ == nullptr
                           ? -1
                           : symbols_.getVideoAlgorithmSize(
                                 video_, &algorithmWidth, &algorithmHeight);
    std::cout << " algorithm_size[" << stage << "]=" << algorithmWidth << 'x'
              << algorithmHeight << " result=" << result << '\n';
  }

  void createHost() {
    featureParametersApplied_ = false;
    openGlContext_.makeCurrent();
    openGlContext_.printCurrent("before manager create");
    const int managerResult = enableParallelAsyncSwing_
                                  ? createParallelAsyncManager(
                                        symbols_, &manager_, width_, height_,
                                        findModelResource,
                                        managerCreateOption_, graphicsDevice_)
                                  : symbols_.createManager(
                                        &manager_,
                                        static_cast<unsigned int>(width_),
                                        static_cast<unsigned int>(height_),
                                        findModelResource,
                                        managerCreateOption_, graphicsDevice_);
    if (managerResult != 0 || manager_ == nullptr) {
      std::cout << "[filter] manager create result = " << managerResult << '\n';
      return;
    }
    openGlContext_.makeCurrent();
    void* amazer = symbols_.getManagerAmazer(manager_);
    if (useBefContextScope_) {
      const FilterRuntimeProfile profile = filterRuntimeProfile(
          reinterpret_cast<const void*>(symbols_.getManagerAmazer));
      contextScope_ = std::make_unique<AmazerContextScope>(
          AmazerContextScopeRequest{
              .knownImageSymbol =
                  reinterpret_cast<const void*>(symbols_.getManagerAmazer),
              .expectedImageUuid = profile.uuid,
              .constructorOffset = profile.contextConstructorOffset,
              .destructorOffset = profile.contextDestructorOffset,
              .context = amazer,
          });
    }

    const int algorithmCacheResult = symbols_.setManagerParameterInt(
        manager_, "AlgorithmCacheFlag", algorithmCacheFlag_);
    const int exportModeResult = symbols_.setManagerParameterBool(
        manager_, "ExportMode", exportMode_);
    const int adjustColorResult = symbols_.setManagerParameterBool(
        manager_, "EnableAdjustColorWithFloat",
        enableAdjustColorWithFloat_);
    const int imageQualityResult = symbols_.setManagerParameterBool(
        manager_, "EnableImageQuality", enableImageQuality_);
    const int simplifyResult = symbols_.setManagerParameterBool(
        manager_, "EnableSwingSimplify", enableSwingSimplify_);
    const int videoResult = symbols_.createSegment(
        manager_, &video_, kVideoSegmentType, "");
    const std::string package = packagePath_.string();
    const int featureResult = video_ == nullptr
                                  ? -1
                                  : symbols_.createVideoFeature(
                                        video_, &feature_, package.c_str());
    const int addFeatureResult = feature_ == nullptr
                                     ? -1
                                     : symbols_.addVideoFeature(video_, feature_);
    const int featureTimeRangeResult =
        feature_ == nullptr
            ? -1
            : symbols_.setSegmentTimeRange(feature_, 0, kTimelineDuration);
    const int featureRenderIndexResult =
        feature_ == nullptr
            ? -1
            : symbols_.setSegmentRenderIndex(feature_, 0);
    const int timeRangeResult = video_ == nullptr
                                    ? -1
                                    : symbols_.setSegmentTimeRange(
                                          video_, 0, kTimelineDuration);
    const int renderIndexResult = video_ == nullptr
                                      ? -1
                                      : symbols_.setSegmentRenderIndex(video_, 0);
    const int addVideoResult = video_ == nullptr
                                   ? -1
                                   : symbols_.addManagerSegment(manager_, video_);
    std::cout << "[filter] create results=" << managerResult << ','
              << algorithmCacheResult << ',' << exportModeResult << ','
              << adjustColorResult << ','
              << imageQualityResult << ','
              << simplifyResult << ',' << videoResult << ',' << featureResult
              << ',' << addFeatureResult << ',' << featureTimeRangeResult << ','
              << featureRenderIndexResult << ',' << timeRangeResult << ','
              << renderIndexResult << ',' << addVideoResult;
    printAlgorithmSize("after-create");
    ready_ = algorithmCacheResult == 0 && exportModeResult == 0 &&
             adjustColorResult == 0 &&
             imageQualityResult == 0 &&
             simplifyResult == 0 && videoResult == 0 && featureResult == 0 &&
             addFeatureResult == 0 && featureTimeRangeResult == 0 &&
             featureRenderIndexResult == 0 && timeRangeResult == 0 &&
             renderIndexResult == 0 && addVideoResult == 0;
  }

  void destroyHost() {
    ready_ = false;
    if (feature_ != nullptr) {
      std::cout << "[filter] feature destroy result = "
                << symbols_.destroySegment(feature_) << '\n';
      feature_ = nullptr;
    }
    if (video_ != nullptr) {
      std::cout << "[filter] video destroy result = "
                << symbols_.destroySegment(video_) << '\n';
      video_ = nullptr;
    }
    contextScope_.reset();
    if (manager_ != nullptr) {
      std::cout << "[filter] manager destroy result = "
                << symbols_.destroyManager(manager_) << '\n';
      manager_ = nullptr;
    }
  }

  const FilterSymbols& symbols_;
  // Owns catalog activation for the session lifetime; releases it even when
  // createHost() throws mid-construction.
  jianying_probe::CatalogRegistration registration_;
  OpenGlContext& openGlContext_;
  fs::path packagePath_;
  int width_;
  int height_;
  void* graphicsDevice_;
  void* manager_ = nullptr;
  void* video_ = nullptr;
  void* feature_ = nullptr;
  std::unique_ptr<AmazerContextScope> contextScope_;
  int inputTextureDataCode_;
  int outputTextureDataCode_;
  int algorithmCacheFlag_;
  std::string featureParameters_;
  bool exportMode_;
  bool enableSwingSimplify_;
  bool enableAdjustColorWithFloat_;
  bool enableImageQuality_;
  bool managerCreateOption_;
  bool enableParallelAsyncSwing_;
  bool useBefContextScope_;
  bool featureParametersApplied_ = false;
  bool ready_ = false;
};

struct RenderContext {
  const FilterSymbols& symbols;
  const ModelCatalog& models;
  OpenGlContext& openGlContext;
  const fs::path& packagePath;
  std::span<const UpdateModePass> renderPasses;
  std::string_view resetAction;
  std::int64_t timestamp;
  int inputTextureDataCode;
  int outputTextureDataCode;
  int algorithmCacheFlag;
  std::string featureParameters;
  bool exportMode;
  bool enableSwingSimplify;
  bool enableAdjustColorWithFloat;
  bool enableImageQuality;
  bool managerCreateOption;
  bool enableParallelAsyncSwing;
  bool useBefContextScope;
  int stageDelayMilliseconds;
  std::unique_ptr<FilterHostSession> session;
};

bool renderFilterFrame(const GraphicsFrameResources& resources) {
  auto* context = static_cast<RenderContext*>(resources.callbackContext);
  if (context == nullptr) {
    return false;
  }
  if (context->session == nullptr) {
    context->session = std::make_unique<FilterHostSession>(
        context->symbols, context->models, context->openGlContext,
        context->packagePath, resources, context->inputTextureDataCode,
        context->outputTextureDataCode, context->algorithmCacheFlag,
        context->featureParameters, context->exportMode,
        context->enableSwingSimplify,
        context->enableAdjustColorWithFloat, context->enableImageQuality,
        context->managerCreateOption, context->enableParallelAsyncSwing,
        context->useBefContextScope);
  } else {
    context->session->setFeatureParameters(context->featureParameters);
  }
  return context->session->render(
      resources, context->renderPasses, context->resetAction,
      context->timestamp, context->stageDelayMilliseconds);
}

struct FilterFrameExecutionRequest {
  GraphicsProbeSession& graphics;
  RenderContext& context;
  const FilterSequenceRequest& sequenceRequest;
  std::span<const std::uint8_t> pixels;
  std::size_t frameBytes;
  fs::path outputPath;
  std::string_view label;
};

[[nodiscard]] bool renderAndWriteFilterFrame(
    const FilterFrameExecutionRequest& request) {
  GraphicsFrameProbeResult frame = request.graphics.renderFrame({
      .renderer = renderFilterFrame,
      .callbackContext = &request.context,
      .inputAPixels = request.pixels,
      .inputBPixels = request.pixels,
      .verifyInputReadback = false,
      .captureRenderedInputA =
          request.sequenceRequest.enableParallelAsyncSwing,
      .useNativeInputTextures = true,
      .nativeTextureFlags = request.sequenceRequest.nativeTextureFlags,
      .postRenderReadbackDelayMilliseconds =
          request.sequenceRequest.postSeekDelayMilliseconds,
  });
  std::vector<std::uint8_t>& renderedPixels =
      request.sequenceRequest.enableParallelAsyncSwing
          ? frame.renderedInputAPixels
          : frame.outputPixels;
  const std::vector<std::uint8_t>& preWaitRenderedPixels =
      request.sequenceRequest.enableParallelAsyncSwing
          ? frame.preWaitRenderedInputAPixels
          : frame.preWaitOutputPixels;
  const bool missingPreWaitReadback =
      request.sequenceRequest.postSeekDelayMilliseconds > 0 &&
      preWaitRenderedPixels.size() != request.frameBytes;
  if (!frame.rendered || renderedPixels.size() != request.frameBytes ||
      missingPreWaitReadback) {
    std::cout << "[filter] " << request.label << " failed\n";
    return false;
  }
  if (request.sequenceRequest.postSeekDelayMilliseconds > 0) {
    std::size_t changedBytes = 0;
    for (std::size_t byteIndex = 0; byteIndex < renderedPixels.size();
         byteIndex += 1) {
      if (renderedPixels[byteIndex] != preWaitRenderedPixels[byteIndex]) {
        changedBytes += 1;
      }
    }
    std::cout << "[filter] post-seek texture changed-bytes=" << changedBytes
              << '/' << renderedPixels.size() << '\n';
  }
  // Textures created with the third createTextureFromNativeBuffer flag read
  // back in RGBA order already; converting again would swap R and B.
  if (!request.sequenceRequest.nativeTextureFlags[2]) {
    convertBgraToRgba(renderedPixels);
  }
  writeRgbaFrame(request.outputPath, renderedPixels);
  return true;
}

struct FilterHostFrameCommand {
  std::string requestId;
  double timestampSeconds;
  fs::path inputPath;
  fs::path outputPath;
  std::string featureParameters;
};

[[nodiscard]] std::vector<std::string> splitHostFields(
    const std::string& line) {
  std::vector<std::string> fields;
  std::size_t start = 0;
  while (start <= line.size()) {
    const std::size_t separator = line.find('\t', start);
    fields.push_back(line.substr(start, separator - start));
    if (separator == std::string::npos) {
      break;
    }
    start = separator + 1;
  }
  return fields;
}

[[nodiscard]] FilterHostFrameCommand parseHostFrameCommand(
    const std::string& line) {
  const std::vector<std::string> fields = splitHostFields(line);
  if (fields.size() != 6 || fields[0] != "render" || fields[1].empty() ||
      fields[2].empty() || fields[3].empty() || fields[4].empty() ||
      fields[5].empty() || fields[5].size() > 64 * 1024) {
    throw std::runtime_error(
        "render command must be render<TAB>id<TAB>seconds<TAB>input<TAB>output<TAB>params");
  }
  std::size_t parsedLength = 0;
  const double timestampSeconds = std::stod(fields[2], &parsedLength);
  if (parsedLength != fields[2].size() || !std::isfinite(timestampSeconds) ||
      timestampSeconds < 0.0 ||
      timestampSeconds * 1'000'000.0 >=
          static_cast<double>(kTimelineDuration)) {
    throw std::runtime_error("render timestamp is outside the host timeline");
  }
  return {
      .requestId = fields[1],
      .timestampSeconds = timestampSeconds,
      .inputPath = fields[3],
      .outputPath = fields[4],
      .featureParameters = fields[5],
  };
}

struct FilterHostDetectCommand {
  std::string requestId;
  fs::path inputPath;
};

struct FilterHostStrokeCommand {
  std::string requestId;
  double timestampSeconds;
  fs::path inputPath;
  fs::path outputPath;
  std::string featureParameters;
  std::vector<std::array<float, 2>> points;
};

[[nodiscard]] double parseHostTimestamp(const std::string& value) {
  std::size_t parsedLength = 0;
  const double timestampSeconds = std::stod(value, &parsedLength);
  if (parsedLength != value.size() || !std::isfinite(timestampSeconds) ||
      timestampSeconds < 0.0 ||
      timestampSeconds * 1'000'000.0 >=
          static_cast<double>(kTimelineDuration)) {
    throw std::runtime_error("render timestamp is outside the host timeline");
  }
  return timestampSeconds;
}

[[nodiscard]] float parseNormalizedCoordinate(
    const std::string& value, std::string_view label) {
  std::size_t parsedLength = 0;
  const float coordinate = std::stof(value, &parsedLength);
  if (parsedLength != value.size() || !std::isfinite(coordinate) ||
      coordinate < 0.0F || coordinate > 1.0F) {
    throw std::runtime_error(std::string(label) +
                             " must be between zero and one");
  }
  return coordinate;
}

[[nodiscard]] FilterHostStrokeCommand parseHostStrokeCommand(
    const std::string& line) {
  const std::vector<std::string> fields = splitHostFields(line);
  if (fields.size() < 10 || fields[0] != "stroke" || fields[1].empty() ||
      fields[2].empty() || fields[3].empty() || fields[4].empty() ||
      fields[5].empty() || fields[5].size() > 64 * 1024 ||
      (fields.size() - 6) % 2 != 0 || fields.size() > 1030) {
    throw std::runtime_error(
        "stroke command must contain frame, params and two to 512 x/y points");
  }
  std::vector<std::array<float, 2>> points;
  points.reserve((fields.size() - 6) / 2);
  for (std::size_t index = 6; index < fields.size(); index += 2) {
    points.push_back({
        parseNormalizedCoordinate(fields[index], "stroke x"),
        parseNormalizedCoordinate(fields[index + 1], "stroke y"),
    });
  }
  return {
      .requestId = fields[1],
      .timestampSeconds = parseHostTimestamp(fields[2]),
      .inputPath = fields[3],
      .outputPath = fields[4],
      .featureParameters = fields[5],
      .points = std::move(points),
  };
}

[[nodiscard]] std::string touchFeatureParameters(
    std::string_view key, const std::array<float, 2>& point) {
  std::array<char, 256> payload{};
  const int length = std::snprintf(
      payload.data(), payload.size(),
      "{\"%.*s\":\"{\\\"x\\\":%.9g,\\\"y\\\":%.9g}\"}",
      static_cast<int>(key.size()), key.data(), point[0], point[1]);
  if (length <= 0 || static_cast<std::size_t>(length) >= payload.size()) {
    throw std::runtime_error("manual touch payload is too long");
  }
  return std::string(payload.data(), static_cast<std::size_t>(length));
}

[[nodiscard]] FilterHostDetectCommand parseHostDetectCommand(
    const std::string& line) {
  const std::vector<std::string> fields = splitHostFields(line);
  if (fields.size() != 3 || fields[0] != "detect" || fields[1].empty() ||
      fields[2].empty()) {
    throw std::runtime_error(
        "detect command must be detect<TAB>id<TAB>input");
  }
  return {.requestId = fields[1], .inputPath = fields[2]};
}

[[nodiscard]] std::string protocolError(std::string message) {
  for (char& character : message) {
    if (character == '\t' || character == '\r' || character == '\n') {
      character = ' ';
    }
  }
  return message;
}

}  // namespace

FilterSequenceResult renderFilterSequence(
    const FilterSequenceRequest& request) {
  if (!(request.frameRate > 0.0)) {
    throw std::runtime_error("filter frame rate must be positive");
  }
  const auto width = static_cast<std::size_t>(request.width);
  const auto height = static_cast<std::size_t>(request.height);
  if (request.width <= 0 || request.height <= 0 ||
      width > std::numeric_limits<std::size_t>::max() / height / 4) {
    throw std::runtime_error("invalid filter frame dimensions");
  }

  const std::vector<FilterSequenceStep> steps =
      readFilterManifest(request.manifestPath);
  OpenGlContext openGlContext(request.runtimeRoot);
  const FilterSymbols symbols = loadFilterSymbols(request.runtimeRoot);
  const bool disableAsyncLoad = false;
  const int asyncLoadResult = symbols.configureAbValue(
      "enable_amazing_async_load", &disableAsyncLoad, 0);
  std::cout << "[filter] disable async asset loading result = "
            << asyncLoadResult << '\n';
  const bool enableMetalAlgorithmInput = true;
  const int metalAlgorithmInputResult = symbols.configureAbValue(
      "effectab_enable_algorithm_mtltexture_input_opt",
      &enableMetalAlgorithmInput, 0);
  std::cout << "[filter] enable Metal algorithm input result = "
            << metalAlgorithmInputResult << '\n';
  const bool enableParallelAsyncSwing = request.enableParallelAsyncSwing;
  const int parallelAsyncSwingResult = symbols.configureAbValue(
      "enable_parallel_and_async_swing", &enableParallelAsyncSwing, 0);
  std::cout << "[filter] parallel/async Swing="
            << enableParallelAsyncSwing
            << " result = " << parallelAsyncSwingResult << '\n';
  if (request.skinSegUseSimdOptim.has_value()) {
    bool skinSegUseSimdOptim = *request.skinSegUseSimdOptim;
    const int skinSegSimdResult = symbols.configureAbValue(
        "enable_skin_seg_use_simd_optim", &skinSegUseSimdOptim, 0);
    std::cout << "[filter] skin-seg SIMD AB=" << skinSegUseSimdOptim
              << " result = " << skinSegSimdResult << '\n';
    if (skinSegSimdResult != 0) {
      throw std::runtime_error("failed to configure skin-seg SIMD AB");
    }
  }
  const ModelCatalog models(request.modelDirectory,
                            request.preferExactModelFilename);
  GraphicsProbeSession graphics(request.runtimeRoot, request.width,
                                request.height);
  if (!graphics.ready()) {
    throw std::runtime_error("graphics session failed to initialize");
  }
  fs::create_directories(request.outputDirectory);

  RenderContext context = {
      .symbols = symbols,
      .models = models,
      .openGlContext = openGlContext,
      .packagePath = request.packagePath,
      .renderPasses = {},
      .resetAction = "none",
      .timestamp = 0,
      .inputTextureDataCode = request.inputTextureDataCode,
      .outputTextureDataCode = request.outputTextureDataCode,
      .algorithmCacheFlag = request.algorithmCacheFlag,
      .featureParameters = request.featureParameters,
      .exportMode = request.exportMode,
      .enableSwingSimplify = request.enableSwingSimplify,
      .enableAdjustColorWithFloat = request.enableAdjustColorWithFloat,
      .enableImageQuality = request.enableImageQuality,
      .managerCreateOption = request.managerCreateOption,
      .enableParallelAsyncSwing = request.enableParallelAsyncSwing,
      .useBefContextScope = request.useBefContextScope,
      .stageDelayMilliseconds = request.stageDelayMilliseconds,
      .session = nullptr,
  };
  const std::size_t diagnosticFrameCount = request.reseekAfterReady ? 1 : 0;
  FilterSequenceResult result = {
      .requestedFrames = steps.size() + diagnosticFrameCount,
  };
  const std::size_t frameBytes = width * height * 4;
  for (std::size_t index = 0; index < steps.size(); index += 1) {
    const FilterSequenceStep& step = steps[index];
    const std::vector<std::uint8_t> pixels =
        readRgbaFrame(step.inputPath, frameBytes);
    context.renderPasses = step.renderPasses;
    context.resetAction = step.resetAction;
    context.timestamp = static_cast<std::int64_t>(
        static_cast<double>(index) * 1'000'000.0 / request.frameRate);
    char filename[32];
    std::snprintf(filename, sizeof(filename), "frame-%04zu.rgba", index);
    const std::string frameLabel = "frame " + std::to_string(index);
    if (renderAndWriteFilterFrame({
            .graphics = graphics,
            .context = context,
            .sequenceRequest = request,
            .pixels = pixels,
            .frameBytes = frameBytes,
            .outputPath = request.outputDirectory / filename,
            .label = frameLabel,
        })) {
      result.renderedFrames += 1;
    }
  }

  if (request.reseekAfterReady) {
    const FilterSequenceStep& firstStep = steps.front();
    const std::vector<std::uint8_t> pixels =
        readRgbaFrame(firstStep.inputPath, frameBytes);
    const std::array<UpdateModePass, 1> reseekPasses = {
        UpdateModePass{.modes = {1}},
    };
    context.renderPasses = reseekPasses;
    context.resetAction = "none";
    context.timestamp = 0;
    std::cout << "[filter] same-timestamp re-seek begin timestamp=0 mode=1; "
                 "verify CoreML ready precedes this marker\n";
    if (renderAndWriteFilterFrame({
            .graphics = graphics,
            .context = context,
            .sequenceRequest = request,
            .pixels = pixels,
            .frameBytes = frameBytes,
            .outputPath =
                request.outputDirectory / "reseek-frame-0000.rgba",
            .label = "same-timestamp re-seek",
        })) {
      result.renderedFrames += 1;
    }
  }
  return result;
}

int runFilterHost(const FilterHostRequest& request) {
  const auto width = static_cast<std::size_t>(request.width);
  const auto height = static_cast<std::size_t>(request.height);
  if (request.width <= 0 || request.height <= 0 ||
      width > std::numeric_limits<std::size_t>::max() / height / 4 ||
      !fs::is_directory(request.runtimeRoot) ||
      !fs::is_directory(request.packagePath) ||
      !fs::is_directory(request.modelDirectory)) {
    throw std::runtime_error("invalid filter host configuration");
  }

  OpenGlContext openGlContext(request.runtimeRoot);
  const FilterSymbols symbols = loadFilterSymbols(request.runtimeRoot);
  const bool disableAsyncLoad = false;
  const bool enableMetalAlgorithmInput = true;
  const bool disableParallelAsyncSwing = false;
  const int asyncLoadResult = symbols.configureAbValue(
      "enable_amazing_async_load", &disableAsyncLoad, 0);
  const int metalInputResult = symbols.configureAbValue(
      "effectab_enable_algorithm_mtltexture_input_opt",
      &enableMetalAlgorithmInput, 0);
  const int parallelResult = symbols.configureAbValue(
      "enable_parallel_and_async_swing", &disableParallelAsyncSwing, 0);
  if (asyncLoadResult != 0 || metalInputResult != 0 || parallelResult != 0) {
    throw std::runtime_error("failed to configure filter host AB values");
  }

  const ModelCatalog models(request.modelDirectory);
  GraphicsProbeSession graphics(request.runtimeRoot, request.width,
                                request.height);
  if (!graphics.ready()) {
    throw std::runtime_error("graphics session failed to initialize");
  }

  const std::array<UpdateModePass, 1> renderPasses = {
      UpdateModePass{.modes = {1}},
  };
  RenderContext context = {
      .symbols = symbols,
      .models = models,
      .openGlContext = openGlContext,
      .packagePath = request.packagePath,
      .renderPasses = renderPasses,
      .resetAction = "none",
      .timestamp = 0,
      .inputTextureDataCode = request.inputTextureDataCode,
      .outputTextureDataCode = request.outputTextureDataCode,
      .algorithmCacheFlag = request.algorithmCacheFlag,
      .featureParameters = {},
      .exportMode = request.exportMode,
      .enableSwingSimplify = request.enableSwingSimplify,
      .enableAdjustColorWithFloat = request.enableAdjustColorWithFloat,
      .enableImageQuality = request.enableImageQuality,
      .managerCreateOption = request.managerCreateOption,
      .enableParallelAsyncSwing = false,
      .useBefContextScope = request.useBefContextScope,
      .stageDelayMilliseconds = 0,
      .session = nullptr,
  };
  FilterSequenceRequest frameOptions = {
      .runtimeRoot = request.runtimeRoot,
      .packagePath = request.packagePath,
      .modelDirectory = request.modelDirectory,
      .width = request.width,
      .height = request.height,
      .frameRate = 30.0,
      .nativeTextureFlags = request.nativeTextureFlags,
      .inputTextureDataCode = request.inputTextureDataCode,
      .outputTextureDataCode = request.outputTextureDataCode,
      .algorithmCacheFlag = request.algorithmCacheFlag,
      .exportMode = request.exportMode,
      .enableSwingSimplify = request.enableSwingSimplify,
      .enableAdjustColorWithFloat = request.enableAdjustColorWithFloat,
      .enableImageQuality = request.enableImageQuality,
      .managerCreateOption = request.managerCreateOption,
      .enableParallelAsyncSwing = false,
      .useBefContextScope = request.useBefContextScope,
  };
  const std::size_t frameBytes = width * height * 4;

  std::cout << "QCUT\tREADY\t1\n" << std::flush;
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line == "exit") {
      break;
    }
    std::string requestId = "-";
    try {
      if (line.rfind("detect\t", 0) == 0) {
        const FilterHostDetectCommand detect = parseHostDetectCommand(line);
        requestId = detect.requestId;
        const std::vector<std::uint8_t> pixels =
            readRgbaFrame(detect.inputPath, frameBytes);
        // Detection runs in the host's already-current engine GL context;
        // both context regimes were verified to produce identical results.
        const std::vector<FaceObservationRecord> faces = inspectFaces({
            .runtimeRoot = request.runtimeRoot,
            .modelDirectory = request.modelDirectory,
            .packagePath = request.packagePath,
            .width = request.width,
            .height = request.height,
            .pixels = &pixels,
        });
        std::cout << "QCUT\tRESULT\t" << requestId << "\t0\t"
                  << encodeFaceObservations(faces) << '\n'
                  << std::flush;
        continue;
      }
      if (line.rfind("stroke\t", 0) == 0) {
        const FilterHostStrokeCommand stroke = parseHostStrokeCommand(line);
        requestId = stroke.requestId;
        if (context.session == nullptr) {
          throw std::runtime_error("manual stroke requires an initialized frame");
        }
        const std::vector<std::uint8_t> pixels =
            readRgbaFrame(stroke.inputPath, frameBytes);
        context.timestamp = static_cast<std::int64_t>(
            std::llround(stroke.timestampSeconds * 1'000'000.0));
        context.featureParameters = stroke.featureParameters;
        if (!context.session->setFeatureParametersNow(
                stroke.featureParameters)) {
          throw std::runtime_error("manual stroke configuration failed");
        }
        const FilterFrameExecutionRequest execution = {
            .graphics = graphics,
            .context = context,
            .sequenceRequest = frameOptions,
            .pixels = pixels,
            .frameBytes = frameBytes,
            .outputPath = stroke.outputPath,
            .label = requestId,
        };
        for (std::size_t index = 0; index < stroke.points.size(); index += 1) {
          const std::string_view event =
              index == 0
                  ? "touch_begin"
                  : (index + 1 == stroke.points.size() ? "touch_end"
                                                       : "touch_move");
          context.featureParameters =
              touchFeatureParameters(event, stroke.points[index]);
          if (!context.session->setFeatureParametersNow(
                  context.featureParameters) ||
              !renderAndWriteFilterFrame(execution)) {
            throw std::runtime_error("manual stroke event failed");
          }
        }
        context.featureParameters = stroke.featureParameters;
        if (!context.session->setFeatureParametersNow(
                stroke.featureParameters) ||
            !renderAndWriteFilterFrame(execution)) {
          throw std::runtime_error("manual stroke cache flush failed");
        }
        std::cout << "QCUT\tRESULT\t" << requestId << "\t0\n" << std::flush;
        continue;
      }
      const FilterHostFrameCommand command = parseHostFrameCommand(line);
      requestId = command.requestId;
      const std::vector<std::uint8_t> pixels =
          readRgbaFrame(command.inputPath, frameBytes);
      context.timestamp = static_cast<std::int64_t>(
          std::llround(command.timestampSeconds * 1'000'000.0));
      context.featureParameters = command.featureParameters;
      const FilterFrameExecutionRequest execution = {
          .graphics = graphics,
          .context = context,
          .sequenceRequest = frameOptions,
          .pixels = pixels,
          .frameBytes = frameBytes,
          .outputPath = command.outputPath,
          .label = requestId,
      };
      const bool warmRendered = renderAndWriteFilterFrame(execution);
      const bool finalRendered =
          warmRendered && renderAndWriteFilterFrame(execution);
      if (!finalRendered) {
        throw std::runtime_error("filter host did not produce a frame");
      }
      std::cout << "QCUT\tRESULT\t" << requestId << "\t0\n" << std::flush;
    } catch (const std::exception& error) {
      std::cout << "QCUT\tRESULT\t" << requestId << "\t1\t"
                << protocolError(error.what()) << '\n'
                << std::flush;
    }
  }
  return 0;
}

}  // namespace jianying_probe
