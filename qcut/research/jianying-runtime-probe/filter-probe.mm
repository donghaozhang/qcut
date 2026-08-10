#include "filter-probe.h"

#include "amazer-context-scope.h"
#include "filter-host-support.h"
#include "filter-sequence-io.h"
#include "graphics-probe.h"
#include "probe-utils.h"

#include <array>
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
#include <utility>
#include <vector>

namespace jianying_probe {
namespace {

constexpr int kVideoSegmentType = 7;
constexpr int kAutomaticRendererType = 14;
constexpr std::int64_t kTimelineDuration = 60'000'000;
constexpr std::string_view kVerifiedFilterCoreUuid =
    "9A8A8F6B-31C0-3DDC-85AC-5F11087D7965";
constexpr std::uintptr_t kAmazerContextScopeConstructorOffset = 0x3fb3cc;
constexpr std::uintptr_t kAmazerContextScopeDestructorOffset = 0x3fb3f8;
constexpr std::size_t kVerifiedSwingManagerSize = 0x370;

constexpr std::string_view kCreateSwingManager =
    "bef_swing_manager_create_with_gpdevice";
constexpr std::string_view kDestroySwingManager = "bef_swing_manager_destroy";
constexpr std::string_view kGetSwingManagerAmazer =
    "_ZNK13AmazingEngine12SwingManager9getAmazerEv";
constexpr std::string_view kSetManagerParameterBool =
    "bef_swing_manager_set_parameter_bool";
constexpr std::string_view kSetManagerUpdateMode =
    "bef_swing_manager_set_update_mode";
constexpr std::string_view kAddManagerSegment =
    "bef_swing_manager_add_segment";
constexpr std::string_view kSeekManagerDeviceTextureWithData =
    "bef_swing_manager_seek_frame_device_texture_with_data";
constexpr std::string_view kCreateSegment = "bef_swing_segment_create";
constexpr std::string_view kDestroySegment = "bef_swing_segment_destroy";
constexpr std::string_view kResetSegment = "bef_swing_segment_reset";
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
  SetIntMethod setManagerUpdateMode;
  AddChildMethod addManagerSegment;
  SeekDeviceTextureWithDataMethod seekManagerDeviceTextureWithData;
  CreateSegmentMethod createSegment;
  HandleMethod destroySegment;
  HandleMethod resetSegment;
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
      .setManagerUpdateMode =
          resolveSymbol<SetIntMethod>(core, kSetManagerUpdateMode),
      .addManagerSegment = resolveSymbol<AddChildMethod>(core, kAddManagerSegment),
      .seekManagerDeviceTextureWithData =
          resolveSymbol<SeekDeviceTextureWithDataMethod>(
              core, kSeekManagerDeviceTextureWithData),
      .createSegment = resolveSymbol<CreateSegmentMethod>(core, kCreateSegment),
      .destroySegment = resolveSymbol<HandleMethod>(core, kDestroySegment),
      .resetSegment = resolveSymbol<HandleMethod>(core, kResetSegment),
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
                     kVerifiedFilterCoreUuid);
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
  symbols.initializeManager(instance, dimensions.data(), algorithmAsync,
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
                    bool enableSwingSimplify, bool managerCreateOption,
                    bool enableParallelAsyncSwing)
      : symbols_(symbols), models_(models), openGlContext_(openGlContext),
        packagePath_(packagePath),
        width_(resources.width), height_(resources.height),
        graphicsDevice_(resources.graphicsDevice),
        inputTextureDataCode_(inputTextureDataCode),
        outputTextureDataCode_(outputTextureDataCode),
        enableSwingSimplify_(enableSwingSimplify),
        managerCreateOption_(managerCreateOption),
        enableParallelAsyncSwing_(enableParallelAsyncSwing) {
    jianying_probe::activateModelCatalog(models_);
    createHost();
  }

  ~FilterHostSession() {
    destroyHost();
    deactivateModelCatalog(models_);
  }

  FilterHostSession(const FilterHostSession&) = delete;
  FilterHostSession& operator=(const FilterHostSession&) = delete;

  [[nodiscard]] bool render(const GraphicsFrameResources& resources,
                            std::span<const UpdateModePass> renderPasses,
                            std::string_view resetAction,
                            std::int64_t timestamp) {
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
    for (const UpdateModePass& renderPass : renderPasses) {
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
              << inputTextureDataCode_ << ',' << outputTextureDataCode_ << '\n';
    return modeResult == 0 && textureResult == 0 && seekResult == 0;
  }

 private:
  void createHost() {
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
    contextScope_ = std::make_unique<AmazerContextScope>(
        AmazerContextScopeRequest{
            .knownImageSymbol =
                reinterpret_cast<const void*>(symbols_.getManagerAmazer),
            .expectedImageUuid = kVerifiedFilterCoreUuid,
            .constructorOffset = kAmazerContextScopeConstructorOffset,
            .destructorOffset = kAmazerContextScopeDestructorOffset,
            .context = amazer,
        });

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
    int algorithmWidth = 0;
    int algorithmHeight = 0;
    const int algorithmSizeResult =
        video_ == nullptr
            ? -1
            : symbols_.getVideoAlgorithmSize(video_, &algorithmWidth,
                                             &algorithmHeight);
    std::cout << "[filter] create results=" << managerResult << ','
              << simplifyResult << ',' << videoResult << ',' << featureResult
              << ',' << addFeatureResult << ',' << featureTimeRangeResult << ','
              << featureRenderIndexResult << ',' << timeRangeResult << ','
              << renderIndexResult << ',' << addVideoResult
              << " algorithm_size=" << algorithmWidth << 'x'
              << algorithmHeight << " result=" << algorithmSizeResult << '\n';
    ready_ = simplifyResult == 0 && videoResult == 0 && featureResult == 0 &&
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
  const ModelCatalog& models_;
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
  bool enableSwingSimplify_;
  bool managerCreateOption_;
  bool enableParallelAsyncSwing_;
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
  bool enableSwingSimplify;
  bool managerCreateOption;
  bool enableParallelAsyncSwing;
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
        context->outputTextureDataCode, context->enableSwingSimplify,
        context->managerCreateOption, context->enableParallelAsyncSwing);
  }
  return context->session->render(resources, context->renderPasses,
                                  context->resetAction, context->timestamp);
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
  OpenGlContext openGlContext;
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
  const ModelCatalog models(request.modelDirectory);
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
      .enableSwingSimplify = request.enableSwingSimplify,
      .managerCreateOption = request.managerCreateOption,
      .enableParallelAsyncSwing = request.enableParallelAsyncSwing,
      .session = nullptr,
  };
  FilterSequenceResult result = {.requestedFrames = steps.size()};
  const std::size_t frameBytes = width * height * 4;
  for (std::size_t index = 0; index < steps.size(); index += 1) {
    const FilterSequenceStep& step = steps[index];
    const std::vector<std::uint8_t> pixels =
        readRgbaFrame(step.inputPath, frameBytes);
    context.renderPasses = step.renderPasses;
    context.resetAction = step.resetAction;
    context.timestamp = static_cast<std::int64_t>(
        static_cast<double>(index) * 1'000'000.0 / request.frameRate);
    GraphicsFrameProbeResult frame = graphics.renderFrame({
        .renderer = renderFilterFrame,
        .callbackContext = &context,
        .inputAPixels = pixels,
        .inputBPixels = pixels,
        .verifyInputReadback = false,
        .useNativeInputTextures = true,
        .nativeTextureFlags = request.nativeTextureFlags,
    });
    if (!frame.rendered || frame.outputPixels.size() != frameBytes) {
      std::cout << "[filter] frame " << index << " failed\n";
      continue;
    }
    convertBgraToRgba(frame.outputPixels);
    char filename[32];
    std::snprintf(filename, sizeof(filename), "frame-%04zu.rgba", index);
    writeRgbaFrame(request.outputDirectory / filename, frame.outputPixels);
    result.renderedFrames += 1;
  }
  return result;
}

}  // namespace jianying_probe
