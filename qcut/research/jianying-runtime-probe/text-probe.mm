#include "text-probe.h"

#include "amazer-context-scope.h"
#include "graphics-probe.h"
#include "probe-utils.h"
#include "text-resource-finder.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace jianying_probe {
namespace {

namespace fs = std::filesystem;

constexpr int kAutomaticRendererType = 14;
constexpr std::int64_t kMaximumTimelineDuration = 60'000'000;

struct TextRuntimeAbiProfile {
  std::string_view name;
  std::string_view coreUuid;
  std::uintptr_t contextScopeConstructorOffset;
  std::uintptr_t contextScopeDestructorOffset;
};

constexpr std::array<TextRuntimeAbiProfile, 2> kTextRuntimeAbiProfiles = {{
    {
        .name = "jianying-text-d634-arm64-v1",
        .coreUuid = "D6342ECD-5432-33F0-A2AD-0C28F5699994",
        .contextScopeConstructorOffset = 0x3fb3bc,
        .contextScopeDestructorOffset = 0x3fb3e8,
    },
    {
        .name = "jianying-text-fdf4-arm64-v1",
        .coreUuid = "FDF42EF4-427D-30DF-9310-A8C7B352C5CD",
        .contextScopeConstructorOffset = 0x3fb3ec,
        .contextScopeDestructorOffset = 0x3fb418,
    },
}};

[[nodiscard]] const TextRuntimeAbiProfile& resolveTextRuntimeAbiProfile(
    const void* knownImageSymbol) {
  const std::string uuid = runtimeImageUuid(knownImageSymbol);
  const auto match = std::find_if(
      kTextRuntimeAbiProfiles.begin(), kTextRuntimeAbiProfiles.end(),
      [&uuid](const TextRuntimeAbiProfile& profile) {
        return profile.coreUuid == uuid;
      });
  if (match == kTextRuntimeAbiProfiles.end()) {
    throw std::runtime_error("unsupported libcccreator text ABI UUID: " +
                             uuid);
  }
  return *match;
}

constexpr std::string_view kCreateManager =
    "bef_swing_manager_create_with_gpdevice";
constexpr std::string_view kDestroyManager = "bef_swing_manager_destroy";
constexpr std::string_view kGetManagerAmazer =
    "_ZNK13AmazingEngine12SwingManager9getAmazerEv";
constexpr std::string_view kGetManagerGraphicsDevice =
    "_ZNK13AmazingEngine12SwingManager11getGPDeviceEv";
constexpr std::string_view kCreateSegment = "bef_swing_segment_create";
constexpr std::string_view kDestroySegment = "bef_swing_segment_destroy";
constexpr std::string_view kSetSegmentTimeRange =
    "bef_swing_segment_set_time_range";
constexpr std::string_view kSetSegmentRenderIndex =
    "bef_swing_segment_set_render_index";
constexpr std::string_view kAddManagerSegment =
    "bef_swing_manager_add_segment";
constexpr std::string_view kSetSegmentParams =
    "bef_swing_segment_set_params";
constexpr std::string_view kSetStickerResolutionType =
    "bef_swing_segment_sticker_set_resolution_type";
constexpr std::string_view kSetStickerParams =
    "bef_swing_segment_sticker_set_params";
constexpr std::string_view kSetStickerAnimation =
    "bef_swing_segment_sticker_set_animation";
constexpr std::string_view kCreateTextStickerFilter =
    "_ZN5vesdk3pub23createTextStickerFilterERKNSt3__112basic_stringIcNS1_11"
    "char_traitsIcEENS1_9allocatorIcEEEES9_S9_S9_x";
constexpr std::string_view kSetTextEffect =
    "_ZN5vesdk3pub13setTextEffectERKNSt3__110shared_ptrINS0_17TextStickerFil"
    "terEEERKNS1_12basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEESE"
    "_bb";
constexpr std::string_view kSetTextFontSize =
    "_ZN5vesdk3pub17TextStickerFilter13set_font_sizeERKd";
constexpr std::string_view kSetTextInnerPadding =
    "_ZN5vesdk3pub17TextStickerFilter17set_inner_paddingERKd";
constexpr std::string_view kSetTextLineGap =
    "_ZN5vesdk3pub17TextStickerFilter12set_line_gapERKd";
constexpr std::string_view kSetTextLineMaxWidth =
    "_ZN5vesdk3pub17TextStickerFilter18set_line_max_widthERKd";
constexpr std::string_view kSetTextShadowSmoothing =
    "_ZN5vesdk3pub17TextStickerFilter20set_shadow_smoothingERKd";
constexpr std::string_view kSetUseEffectDefaultColor =
    "_ZN5vesdk3pub17TextStickerFilter28set_use_effect_default_colorERKb";
constexpr std::string_view kTextStickerToJson =
    "_Z17textStickerToJsonNSt3__110shared_ptrIN5vesdk3pub17TextStickerFilter"
    "EEE";
constexpr std::string_view kSeekManagerDeviceTexture =
    "bef_swing_manager_seek_frame_device_texture";
constexpr std::string_view kSetManagerParameterBool =
    "bef_swing_manager_set_parameter_bool";
constexpr std::string_view kConvertMetalTextureInPlace =
    "_ZN13AmazingEngine12SwingTexture26convertMetalTextureInPlaceER13DeviceText"
    "urePNS_12SwingManagerERKNS_12RendererTypeEx";

using ResourceFinderMethod = char* (*)(void*, const char*, const char*);
using CreateManagerMethod = int (*)(void**, unsigned int, unsigned int,
                                    ResourceFinderMethod, bool, void*);
using DestroyObjectMethod = int (*)(void*);
using GetObjectMethod = void* (*)(const void*);
using CreateSegmentMethod = int (*)(void*, void**, int, const char*);
using SetTimeRangeMethod = int (*)(void*, std::int64_t, std::int64_t);
using SetRenderIndexMethod = int (*)(void*, int);
using AddSegmentMethod = int (*)(void*, void*);
using SetSegmentParamsMethod = int (*)(void*, const char*);
using SetIntegerMethod = int (*)(void*, int);

struct StickerParamsProbe {
  std::array<const char*, 10> values{};
  int count = 0;
};

static_assert(offsetof(StickerParamsProbe, count) == 0x50);

using SetStickerParamsMethod = int (*)(void*, const StickerParamsProbe*);
using SetStickerAnimationMethod = int (*)(void*, int, const char*,
                                          std::int64_t);

namespace vesdk::pub {
class TextStickerFilter;
}

using HostTextSticker = std::shared_ptr<vesdk::pub::TextStickerFilter>;
using CreateTextStickerFilterMethod = HostTextSticker (*)(
    const std::string&, const std::string&, const std::string&,
    const std::string&, long long);
using SetTextEffectMethod = void (*)(const HostTextSticker&,
                                     const std::string&, const std::string&,
                                     bool, bool);
using SetDoubleReferenceMethod = void (*)(void*, const double&);
using SetBoolReferenceMethod = void (*)(void*, const bool&);
using TextStickerToJsonMethod = std::string (*)(HostTextSticker);
using SeekDeviceTextureMethod = int (*)(void*, std::int64_t,
                                        const DeviceTextureProbe*,
                                        const DeviceTextureProbe*);
using SetParameterBoolMethod = int (*)(void*, const char*, bool);
using ConvertMetalTextureMethod = void (*)(DeviceTextureProbe*, void*,
                                           const int*, std::int64_t);

struct TextSymbols {
  CreateManagerMethod createManager;
  DestroyObjectMethod destroyManager;
  GetObjectMethod getManagerAmazer;
  GetObjectMethod getManagerGraphicsDevice;
  CreateSegmentMethod createSegment;
  DestroyObjectMethod destroySegment;
  SetTimeRangeMethod setSegmentTimeRange;
  SetRenderIndexMethod setSegmentRenderIndex;
  AddSegmentMethod addManagerSegment;
  SetSegmentParamsMethod setSegmentParams;
  SetIntegerMethod setStickerResolutionType;
  SetStickerParamsMethod setStickerParams;
  SetStickerAnimationMethod setStickerAnimation;
  CreateTextStickerFilterMethod createTextStickerFilter;
  SetTextEffectMethod setTextEffect;
  SetDoubleReferenceMethod setTextFontSize;
  SetDoubleReferenceMethod setTextInnerPadding;
  SetDoubleReferenceMethod setTextLineGap;
  SetDoubleReferenceMethod setTextLineMaxWidth;
  SetDoubleReferenceMethod setTextShadowSmoothing;
  SetBoolReferenceMethod setUseEffectDefaultColor;
  TextStickerToJsonMethod textStickerToJson;
  SeekDeviceTextureMethod seekManagerDeviceTexture;
  SetParameterBoolMethod setManagerParameterBool;
  ConvertMetalTextureMethod convertMetalTexture;
  TextRuntimeAbiProfile abiProfile;
};

[[nodiscard]] TextSymbols loadTextSymbols(const fs::path& runtimeRoot) {
  void* core = openLibrary(runtimeRoot / "Frameworks" / "libcccreator.dylib");
  const GetObjectMethod getManagerAmazer =
      resolveSymbol<GetObjectMethod>(core, kGetManagerAmazer);
  const TextRuntimeAbiProfile abiProfile = resolveTextRuntimeAbiProfile(
      reinterpret_cast<const void*>(getManagerAmazer));
  return {
      .createManager =
          resolveSymbol<CreateManagerMethod>(core, kCreateManager),
      .destroyManager =
          resolveSymbol<DestroyObjectMethod>(core, kDestroyManager),
      .getManagerAmazer = getManagerAmazer,
      .getManagerGraphicsDevice =
          resolveSymbol<GetObjectMethod>(core, kGetManagerGraphicsDevice),
      .createSegment =
          resolveSymbol<CreateSegmentMethod>(core, kCreateSegment),
      .destroySegment =
          resolveSymbol<DestroyObjectMethod>(core, kDestroySegment),
      .setSegmentTimeRange =
          resolveSymbol<SetTimeRangeMethod>(core, kSetSegmentTimeRange),
      .setSegmentRenderIndex =
          resolveSymbol<SetRenderIndexMethod>(core, kSetSegmentRenderIndex),
      .addManagerSegment =
          resolveSymbol<AddSegmentMethod>(core, kAddManagerSegment),
      .setSegmentParams =
          resolveSymbol<SetSegmentParamsMethod>(core, kSetSegmentParams),
      .setStickerResolutionType = resolveSymbol<SetIntegerMethod>(
          core, kSetStickerResolutionType),
      .setStickerParams =
          resolveSymbol<SetStickerParamsMethod>(core, kSetStickerParams),
      .setStickerAnimation = resolveSymbol<SetStickerAnimationMethod>(
          core, kSetStickerAnimation),
      .createTextStickerFilter = resolveSymbol<CreateTextStickerFilterMethod>(
          core, kCreateTextStickerFilter),
      .setTextEffect =
          resolveSymbol<SetTextEffectMethod>(core, kSetTextEffect),
      .setTextFontSize = resolveSymbol<SetDoubleReferenceMethod>(
          core, kSetTextFontSize),
      .setTextInnerPadding = resolveSymbol<SetDoubleReferenceMethod>(
          core, kSetTextInnerPadding),
      .setTextLineGap = resolveSymbol<SetDoubleReferenceMethod>(
          core, kSetTextLineGap),
      .setTextLineMaxWidth = resolveSymbol<SetDoubleReferenceMethod>(
          core, kSetTextLineMaxWidth),
      .setTextShadowSmoothing = resolveSymbol<SetDoubleReferenceMethod>(
          core, kSetTextShadowSmoothing),
      .setUseEffectDefaultColor = resolveSymbol<SetBoolReferenceMethod>(
          core, kSetUseEffectDefaultColor),
      .textStickerToJson =
          resolveSymbol<TextStickerToJsonMethod>(core, kTextStickerToJson),
      .seekManagerDeviceTexture = resolveSymbol<SeekDeviceTextureMethod>(
          core, kSeekManagerDeviceTexture),
      .setManagerParameterBool = resolveSymbol<SetParameterBoolMethod>(
          core, kSetManagerParameterBool),
      .convertMetalTexture = resolveSymbol<ConvertMetalTextureMethod>(
          core, kConvertMetalTextureInPlace),
      .abiProfile = abiProfile,
  };
}

class ManagerHandle {
 public:
  ManagerHandle(const TextSymbols& symbols, int width, int height,
                void* graphicsDevice, TextResourceFinder::Callback resourceFinder)
      : symbols_(symbols) {
    const int result = symbols_.createManager(
        &manager_, static_cast<unsigned int>(width),
        static_cast<unsigned int>(height), resourceFinder, false,
        graphicsDevice);
    std::cout << "[text] manager create result = " << result
              << ", manager = " << manager_ << '\n';
    if (result != 0 && manager_ != nullptr) {
      static_cast<void>(symbols_.destroyManager(manager_));
      manager_ = nullptr;
    }
  }

  ~ManagerHandle() {
    if (manager_ != nullptr) {
      std::cout << "[text] manager destroy result = "
                << symbols_.destroyManager(manager_) << '\n';
    }
  }

  ManagerHandle(const ManagerHandle&) = delete;
  ManagerHandle& operator=(const ManagerHandle&) = delete;

  [[nodiscard]] void* get() const { return manager_; }

 private:
  const TextSymbols& symbols_;
  void* manager_ = nullptr;
};

class SegmentHandle {
 public:
  SegmentHandle(const TextSymbols& symbols, void* manager, int type,
                const std::string& payload)
      : symbols_(symbols) {
    const int result = symbols_.createSegment(manager, &segment_, type,
                                              payload.c_str());
    std::cout << "[text] segment create result = " << result
              << ", type = " << type << ", segment = " << segment_ << '\n';
    if (result != 0 && segment_ != nullptr) {
      static_cast<void>(symbols_.destroySegment(segment_));
      segment_ = nullptr;
    }
  }

  ~SegmentHandle() {
    if (segment_ != nullptr) {
      std::cout << "[text] segment destroy result = "
                << symbols_.destroySegment(segment_) << '\n';
    }
  }

  SegmentHandle(const SegmentHandle&) = delete;
  SegmentHandle& operator=(const SegmentHandle&) = delete;

  [[nodiscard]] void* get() const { return segment_; }

 private:
  const TextSymbols& symbols_;
  void* segment_ = nullptr;
};

void writeTextFile(const fs::path& outputPath, const std::string& text) {
  if (outputPath.empty()) return;
  if (!outputPath.parent_path().empty()) {
    fs::create_directories(outputPath.parent_path());
  }
  std::ofstream output(outputPath, std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("cannot open text payload output: " +
                             outputPath.string());
  }
  output << text;
  if (!output) {
    throw std::runtime_error("cannot write text payload output: " +
                             outputPath.string());
  }
}

[[nodiscard]] std::string buildHostTextPayload(
    const TextSymbols& symbols, const TextFrameProbeRequest& request) {
  if (request.text.empty()) return {};
  const HostTextSticker sticker = symbols.createTextStickerFilter(
      "qcut-jianying-text-probe", request.text, request.fontPath.string(), "",
      1);
  if (sticker == nullptr) {
    throw std::runtime_error("Jianying failed to create TextStickerFilter");
  }
  symbols.setTextFontSize(sticker.get(), request.fontSize);
  symbols.setTextEffect(sticker, request.packagePath.string(), "", false,
                        false);
  if (request.innerPadding.has_value()) {
    symbols.setTextInnerPadding(sticker.get(), *request.innerPadding);
  }
  if (request.lineGap.has_value()) {
    symbols.setTextLineGap(sticker.get(), *request.lineGap);
  }
  if (request.lineMaxWidth.has_value()) {
    symbols.setTextLineMaxWidth(sticker.get(), *request.lineMaxWidth);
  }
  if (request.shadowSmoothing.has_value()) {
    symbols.setTextShadowSmoothing(sticker.get(), *request.shadowSmoothing);
  }
  constexpr bool kUseEffectDefaultColor = true;
  symbols.setUseEffectDefaultColor(sticker.get(), kUseEffectDefaultColor);
  const std::string payload = symbols.textStickerToJson(sticker);
  if (payload.empty()) {
    throw std::runtime_error("Jianying generated an empty text payload");
  }
  writeTextFile(request.payloadOutputPath, payload);
  std::cout << "[text] host payload bytes = " << payload.size() << '\n';
  return payload;
}

[[nodiscard]] DeviceTextureProbe bridgeTexture(
    const TextSymbols& symbols, void* manager,
    const DeviceTextureProbe& texture, std::int64_t timestamp,
    std::string_view label) {
  DeviceTextureProbe bridged = texture;
  symbols.convertMetalTexture(&bridged, manager, &kAutomaticRendererType,
                              timestamp);
  std::cout << "[text] bridge " << label << ": " << texture.texture << " -> "
            << bridged.texture << '\n';
  return bridged;
}

class TextSwingSession {
 public:
  TextSwingSession(const TextSymbols& symbols,
                   const TextFrameProbeRequest& request,
                   const GraphicsFrameResources& resources)
      : symbols_(symbols), graphicsDevice_(resources.graphicsDevice),
        scriptParameters_(request.scriptParameters),
        resourceFinder_(request.resourceManifestPath) {
    manager_ = std::make_unique<ManagerHandle>(
        symbols_, resources.width, resources.height, resources.graphicsDevice,
        resourceFinder_.callback());
    if (manager_->get() == nullptr) return;

    void* managerGraphicsDevice =
        symbols_.getManagerGraphicsDevice(manager_->get());
    if (managerGraphicsDevice != resources.graphicsDevice) {
      std::cout << "[text] manager graphics device mismatch\n";
      return;
    }

    void* amazer = symbols_.getManagerAmazer(manager_->get());
    contextScope_ = std::make_unique<AmazerContextScope>(
        AmazerContextScopeRequest{
            .knownImageSymbol =
                reinterpret_cast<const void*>(symbols_.getManagerAmazer),
            .expectedImageUuid = symbols_.abiProfile.coreUuid,
            .constructorOffset =
                symbols_.abiProfile.contextScopeConstructorOffset,
            .destructorOffset =
                symbols_.abiProfile.contextScopeDestructorOffset,
            .context = amazer,
        });

    const int simplifyResult =
        request.enableSwingSimplify.has_value()
            ? symbols_.setManagerParameterBool(manager_->get(),
                                               "EnableSwingSimplify",
                                               *request.enableSwingSimplify)
            : 0;
    const std::string hostPayload = buildHostTextPayload(symbols_, request);
    const std::string& segmentPayload =
        request.segmentPayload.empty() ? request.packagePath.string()
                                       : request.segmentPayload;
    segment_ = std::make_unique<SegmentHandle>(
        symbols_, manager_->get(), request.segmentType, segmentPayload);
    if (segment_->get() == nullptr) return;

    const int timeRangeResult = symbols_.setSegmentTimeRange(
        segment_->get(), 0, request.timelineDuration);
    const int renderIndexResult =
        symbols_.setSegmentRenderIndex(segment_->get(), request.renderIndex);
    const int addResult =
        symbols_.addManagerSegment(manager_->get(), segment_->get());
    const int resolutionResult =
        request.resolutionType < 0
            ? 0
            : symbols_.setStickerResolutionType(segment_->get(),
                                                request.resolutionType);
    std::vector<std::string> effectiveStickerParams = request.stickerParams;
    if (!hostPayload.empty()) {
      effectiveStickerParams.insert(effectiveStickerParams.begin(),
                                    hostPayload);
    }
    StickerParamsProbe stickerParams;
    for (std::size_t index = 0; index < effectiveStickerParams.size();
         ++index) {
      stickerParams.values[index] = effectiveStickerParams[index].c_str();
    }
    stickerParams.count = static_cast<int>(effectiveStickerParams.size());
    const int stickerParamsResult =
        effectiveStickerParams.empty()
            ? 0
            : symbols_.setStickerParams(segment_->get(), &stickerParams);
    std::vector<int> animationResults;
    animationResults.reserve(request.animations.size());
    for (const TextAnimationProbeRequest& animation : request.animations) {
      const std::string animationPath = animation.packagePath.string();
      animationResults.push_back(symbols_.setStickerAnimation(
          segment_->get(), animation.type, animationPath.c_str(),
          animation.duration));
    }
    const bool animationsReady =
        std::all_of(animationResults.begin(), animationResults.end(),
                    [](int result) { return result == 0; });
    std::cout << "[text] configure results = " << simplifyResult << ','
              << resolutionResult << ',' << stickerParamsResult;
    for (const int animationResult : animationResults) {
      std::cout << ',' << animationResult;
    }
    std::cout << ',' << timeRangeResult << ',' << renderIndexResult << ','
              << addResult << '\n';
    ready_ = simplifyResult == 0 && resolutionResult == 0 &&
             stickerParamsResult == 0 && animationsReady &&
             timeRangeResult == 0 && renderIndexResult == 0 && addResult == 0;
  }

  ~TextSwingSession() {
    segment_.reset();
    contextScope_.reset();
    manager_.reset();
  }

  TextSwingSession(const TextSwingSession&) = delete;
  TextSwingSession& operator=(const TextSwingSession&) = delete;

  [[nodiscard]] bool render(const GraphicsFrameResources& resources,
                            std::int64_t timestamp) {
    if (!ready_ || resources.graphicsDevice != graphicsDevice_) return false;
    const DeviceTextureProbe input = bridgeTexture(
        symbols_, manager_->get(), resources.inputA, timestamp, "input");
    const DeviceTextureProbe output = bridgeTexture(
        symbols_, manager_->get(), resources.output, timestamp, "output");
    if (input.texture == nullptr || output.texture == nullptr) return false;
    if (!scriptParameters_.empty() && !scriptParametersApplied_) {
      const int primeResult = symbols_.seekManagerDeviceTexture(
          manager_->get(), 0, &input, &output);
      const int parametersResult =
          primeResult == 0
              ? symbols_.setSegmentParams(segment_->get(),
                                          scriptParameters_.c_str())
              : -1;
      std::cout << "[text] script parameter results = " << primeResult << ','
                << parametersResult << '\n';
      if (primeResult != 0 || parametersResult != 0) return false;
      scriptParametersApplied_ = true;
    }
    const int result = symbols_.seekManagerDeviceTexture(
        manager_->get(), timestamp, &input, &output);
    std::cout << "[text] manager seek result = " << result
              << ", timestamp = " << timestamp << '\n';
    return result == 0;
  }

 private:
  const TextSymbols& symbols_;
  void* graphicsDevice_ = nullptr;
  std::string scriptParameters_;
  TextResourceFinder resourceFinder_;
  std::unique_ptr<ManagerHandle> manager_;
  std::unique_ptr<AmazerContextScope> contextScope_;
  std::unique_ptr<SegmentHandle> segment_;
  bool ready_ = false;
  bool scriptParametersApplied_ = false;
};

struct TextRenderContext {
  const TextSymbols& symbols;
  const TextFrameProbeRequest& request;
  std::unique_ptr<TextSwingSession> session;
  std::int64_t timestamp = 0;
};

[[nodiscard]] bool renderTextWithSwingHost(
    const GraphicsFrameResources& resources) {
  if (resources.callbackContext == nullptr) return false;
  auto& context = *static_cast<TextRenderContext*>(resources.callbackContext);
  if (context.session == nullptr) {
    context.session = std::make_unique<TextSwingSession>(
        context.symbols, context.request, resources);
  }
  return context.session->render(resources, context.timestamp);
}

void writeRawRgba(const fs::path& outputPath,
                  const std::vector<std::uint8_t>& pixels) {
  if (outputPath.empty()) return;
  if (!outputPath.parent_path().empty()) {
    fs::create_directories(outputPath.parent_path());
  }
  std::ofstream output(outputPath, std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("cannot open text probe output: " +
                             outputPath.string());
  }
  output.write(reinterpret_cast<const char*>(pixels.data()),
               static_cast<std::streamsize>(pixels.size()));
  if (!output) {
    throw std::runtime_error("cannot write text probe output: " +
                             outputPath.string());
  }
}

[[nodiscard]] TextFrameProbeResult inspectTextPixels(
    const GraphicsFrameProbeResult& frame) {
  TextFrameProbeResult result = {.rendered = frame.rendered};
  for (std::size_t offset = 0; offset + 3 < frame.outputPixels.size();
       offset += 4) {
    const std::uint8_t red = frame.outputPixels[offset];
    const std::uint8_t green = frame.outputPixels[offset + 1];
    const std::uint8_t blue = frame.outputPixels[offset + 2];
    const std::uint8_t alpha = frame.outputPixels[offset + 3];
    if (red != 0 || green != 0 || blue != 0 || alpha != 0) {
      result.changedPixelCount += 1;
    }
    if (alpha != 0) result.nonTransparentPixelCount += 1;
    if (alpha == 0) result.transparentPixelCount += 1;
    if (red != 0 || green != 0 || blue != 0) result.coloredPixelCount += 1;
  }
  result.visibleAndTransparent =
      result.rendered && result.nonTransparentPixelCount > 0 &&
      result.transparentPixelCount > 0 && result.coloredPixelCount > 0;
  return result;
}

void validateOptionalTextNumber(const std::optional<double>& value,
                                double minimum, double maximum,
                                std::string_view label) {
  if (value.has_value() &&
      (!std::isfinite(*value) || *value < minimum || *value > maximum)) {
    throw std::runtime_error(std::string(label) + " is out of range");
  }
}

void validateTextFrameRequest(const TextFrameProbeRequest& request) {
  if (!fs::is_directory(request.packagePath)) {
    throw std::runtime_error("text package does not exist: " +
                             request.packagePath.string());
  }
  if (request.width <= 0 || request.height <= 0) {
    throw std::runtime_error("text frame dimensions must be positive");
  }
  if (!request.fontPath.empty() && !fs::is_regular_file(request.fontPath)) {
    throw std::runtime_error("text font does not exist: " +
                             request.fontPath.string());
  }
  if (!request.resourceManifestPath.empty() &&
      !fs::is_regular_file(request.resourceManifestPath)) {
    throw std::runtime_error("text resource manifest does not exist: " +
                             request.resourceManifestPath.string());
  }
  if (request.fontSize <= 0.0 || request.fontSize > 1000.0) {
    throw std::runtime_error("text font size must be between 0 and 1000");
  }
  validateOptionalTextNumber(request.innerPadding, -1.0, 1000.0,
                             "text inner padding");
  validateOptionalTextNumber(request.lineGap, -10.0, 10.0,
                             "text line gap");
  validateOptionalTextNumber(request.lineMaxWidth, -1.0, 10000.0,
                             "text line max width");
  validateOptionalTextNumber(request.shadowSmoothing, 0.0, 1.0,
                             "text shadow smoothing");
  if (request.segmentType < 0 || request.segmentType > 10) {
    throw std::runtime_error("text segment type must be between 0 and 10");
  }
  if (request.resolutionType < -1 || request.resolutionType > 8) {
    throw std::runtime_error("text resolution type must be between -1 and 8");
  }
  if (request.renderIndex < 0) {
    throw std::runtime_error("text render index must be non-negative");
  }
  if (request.timelineDuration <= 0 ||
      request.timelineDuration > kMaximumTimelineDuration) {
    throw std::runtime_error("text timeline duration must be from 1 to 60000000");
  }
  std::array<bool, 4> animationTypes{};
  for (const TextAnimationProbeRequest& animation : request.animations) {
    if (!fs::is_directory(animation.packagePath)) {
      throw std::runtime_error("text animation package does not exist: " +
                               animation.packagePath.string());
    }
    if (animation.type < 1 || animation.type > 3 ||
        animationTypes[animation.type]) {
      throw std::runtime_error(
          "text animation types must be unique values from 1 to 3");
    }
    if (animation.duration <= 0 ||
        animation.duration > request.timelineDuration) {
      throw std::runtime_error(
          "text animation duration must fit the text timeline");
    }
    animationTypes[animation.type] = true;
  }
  const std::size_t generatedParamCount = request.text.empty() ? 0 : 1;
  if (request.stickerParams.size() + generatedParamCount > 9) {
    throw std::runtime_error("text sticker params must contain at most 9 items");
  }
  if (!std::isfinite(request.timestamp) || request.timestamp < 0 ||
      request.timestamp > request.timelineDuration) {
    throw std::runtime_error("text timestamp must fit the text timeline");
  }
}

void printTextFrameResult(const TextFrameProbeResult& result) {
  std::cout << "[text] changed=" << result.changedPixelCount
            << " nonTransparent=" << result.nonTransparentPixelCount
            << " transparent=" << result.transparentPixelCount
            << " colored=" << result.coloredPixelCount
            << " visibleAndTransparent=" << std::boolalpha
            << result.visibleAndTransparent << '\n';
}

}  // namespace

void inspectTextRuntime(const fs::path& runtimeRoot) {
  if (!fs::is_directory(runtimeRoot)) {
    throw std::runtime_error("runtime root does not exist: " +
                             runtimeRoot.string());
  }

  const TextSymbols symbols = loadTextSymbols(runtimeRoot);
  verifyRuntimeImage(
      reinterpret_cast<const void*>(symbols.getManagerAmazer),
      symbols.abiProfile.coreUuid);
  if (!inspectGraphicsContext(runtimeRoot, false)) {
    throw std::runtime_error("AGFX GPU context initialization failed");
  }
  std::cout << "[text-runtime] abi-profile=" << symbols.abiProfile.name
            << " core-uuid=" << symbols.abiProfile.coreUuid << '\n';
}

TextFrameProbeResult renderTextFrame(const TextFrameProbeRequest& request) {
  validateTextFrameRequest(request);

  const std::size_t pixelBytes = static_cast<std::size_t>(request.width) *
                                 static_cast<std::size_t>(request.height) * 4;
  const std::vector<std::uint8_t> transparentPixels(pixelBytes, 0);
  const TextSymbols symbols = loadTextSymbols(request.runtimeRoot);
  GraphicsProbeSession graphics(request.runtimeRoot, request.width,
                                request.height);
  TextRenderContext context = {
      .symbols = symbols,
      .request = request,
      .timestamp = static_cast<std::int64_t>(std::llround(request.timestamp)),
  };
  const GraphicsFrameProbeResult frame = graphics.renderFrame({
      .renderer = renderTextWithSwingHost,
      .callbackContext = &context,
      .inputAPixels = transparentPixels,
      .inputBPixels = transparentPixels,
  });
  writeRawRgba(request.outputPath, frame.outputPixels);
  const TextFrameProbeResult result = inspectTextPixels(frame);
  printTextFrameResult(result);
  return result;
}

TextSequenceProbeResult renderTextSequence(
    const TextSequenceProbeRequest& request) {
  validateTextFrameRequest(request.frame);
  if (request.frameCount <= 0 || request.frameCount > 18'000) {
    throw std::runtime_error("text sequence frame count must be from 1 to 18000");
  }
  if (!std::isfinite(request.timestampStep) || request.timestampStep < 0.0) {
    throw std::runtime_error("text sequence timestamp step must be non-negative");
  }
  const double finalTimestamp =
      request.frame.timestamp +
      static_cast<double>(request.frameCount - 1) * request.timestampStep;
  if (finalTimestamp > static_cast<double>(request.frame.timelineDuration)) {
    throw std::runtime_error("text sequence exceeds the text timeline");
  }

  if (!request.frame.outputPath.parent_path().empty()) {
    fs::create_directories(request.frame.outputPath.parent_path());
  }
  std::ofstream output(request.frame.outputPath,
                       std::ios::binary | std::ios::trunc);
  if (!output) {
    throw std::runtime_error("cannot open text sequence output: " +
                             request.frame.outputPath.string());
  }

  const std::size_t pixelBytes =
      static_cast<std::size_t>(request.frame.width) *
      static_cast<std::size_t>(request.frame.height) * 4;
  const std::vector<std::uint8_t> transparentPixels(pixelBytes, 0);
  const TextSymbols symbols = loadTextSymbols(request.frame.runtimeRoot);
  GraphicsProbeSession graphics(request.frame.runtimeRoot, request.frame.width,
                                request.frame.height);
  TextRenderContext context = {
      .symbols = symbols,
      .request = request.frame,
      .timestamp =
          static_cast<std::int64_t>(std::llround(request.frame.timestamp)),
  };
  TextSequenceProbeResult result = {.requestedFrames = request.frameCount};

  for (int frameIndex = 0; frameIndex < request.frameCount; ++frameIndex) {
    context.timestamp = static_cast<std::int64_t>(std::llround(
        request.frame.timestamp +
        static_cast<double>(frameIndex) * request.timestampStep));
    const GraphicsFrameProbeResult frame = graphics.renderFrame({
        .renderer = renderTextWithSwingHost,
        .callbackContext = &context,
        .inputAPixels = transparentPixels,
        .inputBPixels = transparentPixels,
        .verifyInputReadback = frameIndex == 0,
    });
    if (!frame.rendered || frame.outputPixels.size() != pixelBytes) break;
    output.write(reinterpret_cast<const char*>(frame.outputPixels.data()),
                 static_cast<std::streamsize>(frame.outputPixels.size()));
    if (!output) {
      throw std::runtime_error("cannot write text sequence frame");
    }
    const TextFrameProbeResult frameResult = inspectTextPixels(frame);
    result.renderedFrames += 1;
    if (frameResult.visibleAndTransparent) result.visibleFrames += 1;
  }

  std::cout << "[text-sequence] rendered=" << result.renderedFrames << '/'
            << result.requestedFrames << " visible=" << result.visibleFrames
            << '\n';
  return result;
}

}  // namespace jianying_probe
