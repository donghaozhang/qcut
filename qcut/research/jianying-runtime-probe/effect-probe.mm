#import <AppKit/AppKit.h>

#include "effect-probe.h"

#include "graphics-probe.h"
#include "probe-utils.h"

#include <dlfcn.h>
#include <mach-o/loader.h>

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace jianying_probe {
namespace {

/**
 * `AmazerContextScope` is not exported, so its constructor/destructor are
 * reached through image offsets derived from this exact libcccreator build.
 * Applying them to a different build would jump into unrelated code, so the
 * image identity is checked before either offset is used.
 */
constexpr std::string_view kVerifiedEffectCoreUuid =
    "D6342ECD-5432-33F0-A2AD-0C28F5699994";
constexpr std::uintptr_t kAmazerContextScopeConstructorOffset = 0x3fb3bc;
constexpr std::uintptr_t kAmazerContextScopeDestructorOffset = 0x3fb3e8;
constexpr std::size_t kAmazerContextScopeStorageSize = 0x8;

/**
 * SwingSegmentType values, recovered by reading each created object's vtable
 * pointer back to its symbol. Only the two used here are named; the factory
 * rejects anything above 10.
 */
constexpr int kFeatureSegmentType = 0;  // 画面特效 / 人物特效
constexpr int kVideoSegmentType = 7;

constexpr int kAutomaticRendererType = 14;
/** Packages declare a 3 s default duration; the catalog agrees. */
constexpr std::int64_t kEffectDurationMicroseconds = 3'000'000;

constexpr std::string_view kCreateSwingManagerApi =
    "bef_swing_manager_create_with_gpdevice";
constexpr std::string_view kDestroySwingManagerApi =
    "bef_swing_manager_destroy";
constexpr std::string_view kGetSwingManagerAmazer =
    "_ZNK13AmazingEngine12SwingManager9getAmazerEv";
constexpr std::string_view kGetSwingManagerGraphicsDevice =
    "_ZNK13AmazingEngine12SwingManager11getGPDeviceEv";
constexpr std::string_view kCreateSegmentApi = "bef_swing_segment_create";
constexpr std::string_view kDestroySegmentApi = "bef_swing_segment_destroy";
constexpr std::string_view kSetSegmentTimeRangeApi =
    "bef_swing_segment_set_time_range";
constexpr std::string_view kSetSegmentRenderIndexApi =
    "bef_swing_segment_set_render_index";
constexpr std::string_view kSetSegmentParamsApi =
    "bef_swing_segment_set_params";
constexpr std::string_view kSetVideoDeviceTextureApi =
    "bef_swing_segment_video_set_device_texture";
constexpr std::string_view kVideoAddFeatureApi =
    "bef_swing_segment_video_add_feature";
constexpr std::string_view kFeatureSetOrderApi =
    "bef_swing_segment_feature_set_order";
constexpr std::string_view kAddManagerSegmentApi =
    "bef_swing_manager_add_segment";
constexpr std::string_view kSeekManagerDeviceTextureApi =
    "bef_swing_manager_seek_frame_device_texture";
constexpr std::string_view kSetManagerParameterBoolApi =
    "bef_swing_manager_set_parameter_bool";
constexpr std::string_view kConvertMetalTextureInPlace =
    "_ZN13AmazingEngine12SwingTexture26convertMetalTextureInPlaceER13DeviceText"
    "urePNS_12SwingManagerERKNS_12RendererTypeEx";
/** Any exported symbol works as the image anchor for dladdr. */
constexpr std::string_view kImageAnchorSymbol =
    "_ZN13AmazingEngine17TransitionSegmentC1Ev";

using ObjectMethod = void (*)(void*);
using GetObjectMethod = void* (*)(const void*);
using CreateSwingManagerApiMethod = int (*)(void**, unsigned int, unsigned int,
                                            void*, bool, void*);
using DestroySwingManagerApiMethod = int (*)(void*);
using CreateSegmentApiMethod = int (*)(void*, void**, int, const char*);
using DestroySegmentApiMethod = int (*)(void*);
using SetSegmentTimeRangeApiMethod = int (*)(void*, std::int64_t, std::int64_t);
using SetSegmentRenderIndexApiMethod = int (*)(void*, int);
using SetSegmentParamsApiMethod = int (*)(void*, const char**, const char**,
                                          int);
using SetVideoDeviceTextureApiMethod = int (*)(void*,
                                               const DeviceTextureProbe*);
using VideoAddFeatureApiMethod = int (*)(void*, void*);
using FeatureSetOrderApiMethod = int (*)(void*, int);
using AddManagerSegmentApiMethod = int (*)(void*, void*);
using SeekManagerDeviceTextureApiMethod = int (*)(void*, std::int64_t,
                                                  const DeviceTextureProbe*,
                                                  const DeviceTextureProbe*);
using SetManagerParameterBoolApiMethod = int (*)(void*, const char*, bool);
using ConvertMetalTextureInPlaceMethod = void (*)(DeviceTextureProbe*, void*,
                                                  const int*, std::int64_t);
using ContextScopeConstructorMethod = void (*)(void*, void*);

struct EffectSymbols {
  CreateSwingManagerApiMethod createSwingManager;
  DestroySwingManagerApiMethod destroySwingManager;
  GetObjectMethod getSwingManagerAmazer;
  GetObjectMethod getSwingManagerGraphicsDevice;
  CreateSegmentApiMethod createSegment;
  DestroySegmentApiMethod destroySegment;
  SetSegmentTimeRangeApiMethod setSegmentTimeRange;
  SetSegmentRenderIndexApiMethod setSegmentRenderIndex;
  SetSegmentParamsApiMethod setSegmentParams;
  SetVideoDeviceTextureApiMethod setVideoDeviceTexture;
  VideoAddFeatureApiMethod videoAddFeature;
  FeatureSetOrderApiMethod featureSetOrder;
  AddManagerSegmentApiMethod addManagerSegment;
  SeekManagerDeviceTextureApiMethod seekManagerDeviceTexture;
  SetManagerParameterBoolApiMethod setManagerParameterBool;
  ConvertMetalTextureInPlaceMethod convertMetalTextureInPlace;
  ContextScopeConstructorMethod contextScopeConstructor;
  ObjectMethod contextScopeDestructor;
};

[[nodiscard]] std::string imageUuid(const void* imageBase) {
  const auto* header = static_cast<const mach_header_64*>(imageBase);
  const auto* command = reinterpret_cast<const load_command*>(header + 1);
  for (std::uint32_t index = 0; index < header->ncmds; index += 1) {
    if (command->cmd == LC_UUID) {
      const std::uint8_t* bytes =
          reinterpret_cast<const uuid_command*>(command)->uuid;
      char formatted[37];
      std::snprintf(formatted, sizeof(formatted),
                    "%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%"
                    "02X%02X%02X",
                    bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
                    bytes[6], bytes[7], bytes[8], bytes[9], bytes[10],
                    bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
      return std::string(formatted);
    }
    command = reinterpret_cast<const load_command*>(
        reinterpret_cast<const std::uint8_t*>(command) + command->cmdsize);
  }
  return {};
}

void assertVerifiedEffectCore(void* anchor) {
  Dl_info image{};
  if (dladdr(anchor, &image) == 0 || image.dli_fbase == nullptr) {
    throw std::runtime_error(
        "dladdr failed while identifying libcccreator.dylib");
  }

  const std::string loaded = imageUuid(image.dli_fbase);
  if (loaded.empty()) {
    throw std::runtime_error(
        "libcccreator.dylib has no LC_UUID; refusing to apply image offsets");
  }

  const char* override = std::getenv("JY_EFFECT_CORE_UUID");
  const std::string expected = override != nullptr && *override != '\0'
                                   ? std::string(override)
                                   : std::string(kVerifiedEffectCoreUuid);
  if (loaded == expected) {
    return;
  }

  throw std::runtime_error(
      "libcccreator.dylib is " + loaded +
      " but the hardcoded image offsets were derived from " + expected +
      ". Re-derive them against this build, then set JY_EFFECT_CORE_UUID to "
      "its UUID.");
}

template <typename Function>
[[nodiscard]] Function resolveImageOffset(void* anchor, std::uintptr_t offset,
                                          std::string_view label) {
  Dl_info image{};
  if (dladdr(anchor, &image) == 0 || image.dli_fbase == nullptr) {
    throw std::runtime_error("dladdr failed while resolving " +
                             std::string(label));
  }
  return reinterpret_cast<Function>(
      reinterpret_cast<std::uintptr_t>(image.dli_fbase) + offset);
}

[[nodiscard]] EffectSymbols loadEffectCore(const fs::path& runtimeRoot) {
  void* core = openLibrary(runtimeRoot / "Frameworks" / "libcccreator.dylib");
  void* anchor = resolveSymbol<void*>(core, kImageAnchorSymbol);
  assertVerifiedEffectCore(anchor);

  return {
      .createSwingManager = resolveSymbol<CreateSwingManagerApiMethod>(
          core, kCreateSwingManagerApi),
      .destroySwingManager = resolveSymbol<DestroySwingManagerApiMethod>(
          core, kDestroySwingManagerApi),
      .getSwingManagerAmazer =
          resolveSymbol<GetObjectMethod>(core, kGetSwingManagerAmazer),
      .getSwingManagerGraphicsDevice =
          resolveSymbol<GetObjectMethod>(core, kGetSwingManagerGraphicsDevice),
      .createSegment =
          resolveSymbol<CreateSegmentApiMethod>(core, kCreateSegmentApi),
      .destroySegment =
          resolveSymbol<DestroySegmentApiMethod>(core, kDestroySegmentApi),
      .setSegmentTimeRange = resolveSymbol<SetSegmentTimeRangeApiMethod>(
          core, kSetSegmentTimeRangeApi),
      .setSegmentRenderIndex = resolveSymbol<SetSegmentRenderIndexApiMethod>(
          core, kSetSegmentRenderIndexApi),
      .setSegmentParams =
          resolveSymbol<SetSegmentParamsApiMethod>(core, kSetSegmentParamsApi),
      .setVideoDeviceTexture = resolveSymbol<SetVideoDeviceTextureApiMethod>(
          core, kSetVideoDeviceTextureApi),
      .videoAddFeature =
          resolveSymbol<VideoAddFeatureApiMethod>(core, kVideoAddFeatureApi),
      .featureSetOrder =
          resolveSymbol<FeatureSetOrderApiMethod>(core, kFeatureSetOrderApi),
      .addManagerSegment =
          resolveSymbol<AddManagerSegmentApiMethod>(core, kAddManagerSegmentApi),
      .seekManagerDeviceTexture =
          resolveSymbol<SeekManagerDeviceTextureApiMethod>(
              core, kSeekManagerDeviceTextureApi),
      .setManagerParameterBool =
          resolveSymbol<SetManagerParameterBoolApiMethod>(
              core, kSetManagerParameterBoolApi),
      .convertMetalTextureInPlace =
          resolveSymbol<ConvertMetalTextureInPlaceMethod>(
              core, kConvertMetalTextureInPlace),
      .contextScopeConstructor =
          resolveImageOffset<ContextScopeConstructorMethod>(
              anchor, kAmazerContextScopeConstructorOffset,
              "AmazerContextScope::AmazerContextScope"),
      .contextScopeDestructor = resolveImageOffset<ObjectMethod>(
          anchor, kAmazerContextScopeDestructorOffset,
          "AmazerContextScope::~AmazerContextScope"),
  };
}

class AmazerContextScope {
 public:
  AmazerContextScope(ContextScopeConstructorMethod constructor,
                     ObjectMethod destructor, void* context)
      : destructor_(destructor) {
    constructor(storage_.bytes, context);
  }
  ~AmazerContextScope() { destructor_(storage_.bytes); }

  AmazerContextScope(const AmazerContextScope&) = delete;
  AmazerContextScope& operator=(const AmazerContextScope&) = delete;

 private:
  struct alignas(16) Storage {
    std::byte bytes[kAmazerContextScopeStorageSize]{};
  } storage_;
  ObjectMethod destructor_;
};

class SwingManagerHandle {
 public:
  SwingManagerHandle(const EffectSymbols& symbols, int width, int height,
                     void* graphicsDevice)
      : symbols_(symbols) {
    const int result = symbols.createSwingManager(
        &manager_, static_cast<unsigned int>(width),
        static_cast<unsigned int>(height), nullptr, false, graphicsDevice);
    if (result != 0) {
      if (manager_ != nullptr) {
        static_cast<void>(symbols.destroySwingManager(manager_));
      }
      manager_ = nullptr;
    }
  }

  ~SwingManagerHandle() {
    if (manager_ != nullptr) {
      static_cast<void>(symbols_.destroySwingManager(manager_));
    }
  }

  SwingManagerHandle(const SwingManagerHandle&) = delete;
  SwingManagerHandle& operator=(const SwingManagerHandle&) = delete;

  [[nodiscard]] void* get() const { return manager_; }

 private:
  const EffectSymbols& symbols_;
  void* manager_ = nullptr;
};

class SegmentHandle {
 public:
  SegmentHandle(const EffectSymbols& symbols, void* manager, int type,
                const char* path)
      : symbols_(symbols) {
    const int result = symbols.createSegment(manager, &segment_, type, path);
    if (result != 0) {
      if (segment_ != nullptr) {
        static_cast<void>(symbols.destroySegment(segment_));
      }
      segment_ = nullptr;
    }
  }

  ~SegmentHandle() {
    if (segment_ != nullptr) {
      static_cast<void>(symbols_.destroySegment(segment_));
    }
  }

  SegmentHandle(const SegmentHandle&) = delete;
  SegmentHandle& operator=(const SegmentHandle&) = delete;

  [[nodiscard]] void* get() const { return segment_; }

 private:
  const EffectSymbols& symbols_;
  void* segment_ = nullptr;
};

[[nodiscard]] DeviceTextureProbe bridgeTexture(
    const EffectSymbols& symbols, void* manager,
    const DeviceTextureProbe& texture, std::int64_t timestamp) {
  DeviceTextureProbe bridged = texture;
  symbols.convertMetalTextureInPlace(&bridged, manager, &kAutomaticRendererType,
                                     timestamp);
  return bridged;
}

/**
 * Holds the loaded package for the lifetime of a clip's render.
 *
 * A 特效 is a FeatureSegment attached to the VideoSegment that carries the
 * frame — it is not an independent segment on the manager. Adding it to the
 * manager as well makes preprocessing reject both segments.
 */
class EffectRenderSession {
 public:
  EffectRenderSession(const EffectSymbols& symbols, const fs::path& packagePath,
                      std::span<const EffectAdjustParameter> adjustParameters,
                      const GraphicsFrameResources& resources)
      : symbols_(symbols), graphicsDevice_(resources.graphicsDevice) {
    manager_ = std::make_unique<SwingManagerHandle>(
        symbols, resources.width, resources.height, resources.graphicsDevice);
    if (manager_->get() == nullptr) {
      return;
    }

    void* globalContext = symbols.getSwingManagerAmazer(manager_->get());
    if (globalContext == nullptr ||
        symbols.getSwingManagerGraphicsDevice(manager_->get()) !=
            resources.graphicsDevice) {
      return;
    }

    // Without this the manager renders nothing at all.
    if (symbols.setManagerParameterBool(manager_->get(), "EnableSwingSimplify",
                                        true) != 0) {
      return;
    }

    contextScope_ = std::make_unique<AmazerContextScope>(
        symbols.contextScopeConstructor, symbols.contextScopeDestructor,
        globalContext);
    videoSegment_ = std::make_unique<SegmentHandle>(
        symbols, manager_->get(), kVideoSegmentType, "");
    const std::string package = packagePath.string();
    effectSegment_ = std::make_unique<SegmentHandle>(
        symbols, manager_->get(), kFeatureSegmentType, package.c_str());
    if (videoSegment_->get() == nullptr || effectSegment_->get() == nullptr) {
      return;
    }

    applyAdjustParameters(adjustParameters);

    const int videoRange = symbols.setSegmentTimeRange(
        videoSegment_->get(), 0, kEffectDurationMicroseconds);
    const int effectRange = symbols.setSegmentTimeRange(
        effectSegment_->get(), 0, kEffectDurationMicroseconds);
    const int videoIndex = symbols.setSegmentRenderIndex(videoSegment_->get(), 0);
    static_cast<void>(symbols.featureSetOrder(effectSegment_->get(), 0));
    const int attachResult =
        symbols.videoAddFeature(videoSegment_->get(), effectSegment_->get());
    const int addVideo =
        symbols.addManagerSegment(manager_->get(), videoSegment_->get());

    ready_ = videoRange == 0 && effectRange == 0 && videoIndex == 0 &&
             attachResult == 0 && addVideo == 0;
  }

  EffectRenderSession(const EffectRenderSession&) = delete;
  EffectRenderSession& operator=(const EffectRenderSession&) = delete;

  [[nodiscard]] bool render(const GraphicsFrameResources& resources,
                            double seconds) {
    if (!ready_ || resources.graphicsDevice != graphicsDevice_) {
      return false;
    }

    const auto timestamp = static_cast<std::int64_t>(seconds * 1'000'000.0);
    const DeviceTextureProbe input =
        bridgeTexture(symbols_, manager_->get(), resources.inputA, timestamp);
    const DeviceTextureProbe output =
        bridgeTexture(symbols_, manager_->get(), resources.output, timestamp);
    if (input.texture == nullptr || output.texture == nullptr) {
      return false;
    }

    if (symbols_.setVideoDeviceTexture(videoSegment_->get(), &input) != 0) {
      return false;
    }
    return symbols_.seekManagerDeviceTexture(manager_->get(), timestamp, &input,
                                             &output) == 0;
  }

 private:
  /** Sliders arrive as the package's own `effects_adjust_*` key/value pairs. */
  void applyAdjustParameters(
      std::span<const EffectAdjustParameter> adjustParameters) {
    if (adjustParameters.empty()) {
      return;
    }

    std::vector<std::string> valueStorage;
    std::vector<const char*> keys;
    std::vector<const char*> values;
    valueStorage.reserve(adjustParameters.size());
    keys.reserve(adjustParameters.size());
    values.reserve(adjustParameters.size());
    for (const EffectAdjustParameter& parameter : adjustParameters) {
      valueStorage.push_back(std::to_string(parameter.value));
      keys.push_back(parameter.key.c_str());
    }
    for (const std::string& value : valueStorage) {
      values.push_back(value.c_str());
    }
    static_cast<void>(symbols_.setSegmentParams(
        effectSegment_->get(), keys.data(), values.data(),
        static_cast<int>(keys.size())));
  }

  const EffectSymbols& symbols_;
  void* graphicsDevice_ = nullptr;
  std::unique_ptr<SwingManagerHandle> manager_;
  std::unique_ptr<AmazerContextScope> contextScope_;
  std::unique_ptr<SegmentHandle> videoSegment_;
  std::unique_ptr<SegmentHandle> effectSegment_;
  bool ready_ = false;
};

struct EffectRenderContext {
  const EffectSymbols& symbols;
  fs::path packagePath;
  std::vector<EffectAdjustParameter> adjustParameters;
  double seconds = 0.0;
  std::unique_ptr<EffectRenderSession> session;
};

[[nodiscard]] bool renderWithEffectHost(
    const GraphicsFrameResources& resources) {
  if (resources.callbackContext == nullptr) {
    return false;
  }
  auto& context = *static_cast<EffectRenderContext*>(resources.callbackContext);
  if (context.session == nullptr) {
    context.session = std::make_unique<EffectRenderSession>(
        context.symbols, context.packagePath, context.adjustParameters,
        resources);
  }
  return context.session->render(resources, context.seconds);
}

}  // namespace

struct EffectPixelSession::Impl {
  EffectSymbols symbols;
  GraphicsProbeSession graphics;
  EffectRenderContext context;

  Impl(const fs::path& runtimeRoot, const fs::path& packagePath, int width,
       int height, std::span<const EffectAdjustParameter> adjustParameters)
      : symbols(loadEffectCore(runtimeRoot)),
        graphics(runtimeRoot, width, height),
        context{
            .symbols = symbols,
            .packagePath = packagePath,
            .adjustParameters = {adjustParameters.begin(),
                                 adjustParameters.end()},
        } {}

  [[nodiscard]] EffectPixelFrameResult renderFrame(
      const EffectSessionFrameRequest& request) {
    context.seconds = request.seconds;
    GraphicsFrameProbeResult result = graphics.renderFrame({
        .renderer = renderWithEffectHost,
        .callbackContext = &context,
        .inputAPixels = request.inputPixels,
        .inputBPixels = request.inputPixels,
        .verifyInputReadback = false,
    });
    return {
        .rendered = result.rendered,
        .outputPixels = std::move(result.outputPixels),
    };
  }
};

EffectPixelSession::EffectPixelSession(
    const fs::path& runtimeRoot, const fs::path& packagePath, int width,
    int height, std::span<const EffectAdjustParameter> adjustParameters)
    : impl_(std::make_unique<Impl>(runtimeRoot, packagePath, width, height,
                                   adjustParameters)) {}

EffectPixelSession::~EffectPixelSession() = default;
EffectPixelSession::EffectPixelSession(EffectPixelSession&&) noexcept = default;
EffectPixelSession& EffectPixelSession::operator=(
    EffectPixelSession&&) noexcept = default;

EffectPixelFrameResult EffectPixelSession::renderFrame(
    const EffectSessionFrameRequest& request) {
  if (impl_ == nullptr) {
    return {};
  }
  return impl_->renderFrame(request);
}

EffectPixelFrameResult renderEffectPixelFrame(
    const EffectPixelFrameRequest& request) {
  EffectPixelSession session(request.runtimeRoot, request.packagePath,
                             request.width, request.height,
                             request.adjustParameters);
  return session.renderFrame({
      .inputPixels = request.inputPixels,
      .seconds = request.seconds,
  });
}

bool inspectEffectPackage(const fs::path& runtimeRoot,
                          const fs::path& packagePath, double seconds) {
  [NSApplication sharedApplication];
  if (!fs::is_directory(packagePath)) {
    throw std::runtime_error("missing effect package: " + packagePath.string());
  }

  // A package that loads renders a frame; identity output is normal, because
  // many effects only differ from their input on part of their timeline.
  const EffectPixelFrameResult result = renderEffectPixelFrame({
      .runtimeRoot = runtimeRoot,
      .packagePath = packagePath,
      .width = kProbeTextureSize,
      .height = kProbeTextureSize,
      .inputPixels = {},
      .seconds = seconds,
  });
  std::cout << "[effect] package " << packagePath.filename().string() << " @ "
            << seconds << "s rendered = " << std::boolalpha << result.rendered
            << '\n';
  return result.rendered;
}

}  // namespace jianying_probe
